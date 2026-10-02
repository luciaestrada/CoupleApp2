import { todayInMadrid } from '../utils/dateUtils';

export const REMINDER_PREFIX = 'coupleapp-reminder:';
const madridClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function calendarDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error('Fecha inválida');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Fecha inválida');
  return date;
}
function shiftDay(day, days) {
  const date = calendarDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function occurrence(row, today) {
  const original = calendarDay(row.date);
  if (!row.recurring) return row.date;
  const inYear = (year) => {
    const month = original.getUTCMonth();
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(original.getUTCDate(), last))).toISOString().slice(0, 10);
  };
  const year = Number(today.slice(0, 4));
  const candidate = inYear(year);
  return candidate >= today ? candidate : inYear(year + 1);
}
export function madridReminderTime(day) {
  const target = calendarDay(day).getTime() + 9 * 3600000;
  let timestamp = target;
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = Object.fromEntries(madridClock.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    timestamp += target - wall;
  }
  return timestamp;
}

export function planLocalReminders({ userId, coupleId, dates, plans, settings, now = Date.now() }) {
  if (!coupleId || !settings?.notifications_enabled || !settings.dates_enabled) return [];
  const today = todayInMadrid(new Date(now));
  const reminders = [];
  const add = (row, type, day, daysBefore = 0, target = day) => {
    const at = madridReminderTime(day);
    if (at <= now) return;
    const dedupeKey = type === 'date' ? `special-date:${row.id}:${target}:${daysBefore}` : null;
    const identifier = `${REMINDER_PREFIX}${userId}:${coupleId}:${type}:${row.id}:${target}:${daysBefore}`;
    const title = type === 'plan' ? 'Tenéis un plan hoy' : daysBefore ? 'Fecha especial próxima' : '¡Es hoy! 🎉';
    const content = {
      title, sound: 'default',
      body: settings.preview_enabled ? `${row.title}${daysBefore ? ` en ${daysBefore} días` : ''}` : 'Abre CoupleApp para ver el recordatorio',
      data: { type: 'local_reminder', userId, coupleId, entityId: row.id,
        screen: type === 'plan' ? 'Planes' : 'Fechas', dedupeKey },
    };
    content.data.reminderSignature = JSON.stringify([at, content.title, content.body, row.version ?? 0]);
    reminders.push({ identifier, content, at, dedupeKey });
  };
  for (const row of dates) {
    if (row.couple_id !== coupleId) continue;
    const target = occurrence(row, today);
    for (const days of new Set([0, row.notify_days_before]))
      if (Number.isInteger(days) && days >= 0 && days <= 365) add(row, 'date', shiftDay(target, -days), days, target);
  }
  for (const row of plans) {
    if (row.couple_id === coupleId && row.status === 'pending' && row.planned_date)
      add(row, 'plan', row.planned_date);
  }
  // Leave room below iOS's pending-notification limit for other app features.
  return reminders.sort((a, b) => a.at - b.at || a.identifier.localeCompare(b.identifier)).slice(0, 40);
}

export async function reconcileLocalReminders({ desired, scheduled, schedule, cancel, isCurrent, handled, saveHandled = () => {}, now = Date.now() }) {
  const wanted = new Map(desired.map(item => [item.identifier, item]));
  for (const [key, value] of Object.entries(handled))
    if (!value || !Number.isFinite(value.at) || value.at + 86400000 < now) delete handled[key];
  saveHandled();
  for (const item of scheduled.filter(item => item.identifier.startsWith(REMINDER_PREFIX))) {
    if (!isCurrent()) return;
    const next = wanted.get(item.identifier);
    if (!next || next.content.data.reminderSignature !== item.content.data?.reminderSignature) {
      await cancel(item.identifier);
      const key = item.content.data?.dedupeKey;
      if (key && handled[key]?.at > now) delete handled[key];
    } else {
      if (next.dedupeKey) handled[next.dedupeKey] = { at: next.at };
      wanted.delete(item.identifier);
    }
    saveHandled();
  }
  for (const item of wanted.values()) {
    if (!isCurrent()) return;
    await schedule({ identifier: item.identifier, content: item.content, trigger: { type: 'date', date: new Date(item.at) } });
    if (!isCurrent()) { await cancel(item.identifier); return; }
    if (item.dedupeKey) handled[item.dedupeKey] = { at: item.at };
    saveHandled();
  }
}
