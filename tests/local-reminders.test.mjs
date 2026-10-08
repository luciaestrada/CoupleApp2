import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from './support/source.mjs';
const dataURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const dates = await readFile(new URL('../src/utils/dateUtils.ts', import.meta.url), 'utf8');
const source = (await readFile(new URL('../src/services/localReminderPlanner.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');
export const planner = await import(dataURL(`const {todayInMadrid}=await import('${dataURL(dates)}');\n${source}`));
const { planLocalReminders, madridReminderTime, reconcileLocalReminders } = planner;
const now = Date.parse('2026-10-02T06:00:00Z');
const input = () => ({ userId: 'u', coupleId: 'c', now,
  settings: { notifications_enabled: true, dates_enabled: true, preview_enabled: false },
  dates: [{ id: 'd', couple_id: 'c', title: 'Aniversario privado', date: '2020-10-04', recurring: true, notify_days_before: 2 }],
  plans: [{ id: 'p', couple_id: 'c', title: 'Cena privada', planned_date: '2026-10-02', status: 'pending', version: 1 }],
});

test('recordatorios: Madrid a las 09:00, cambios de hora, antelación y navegación sin exponer títulos', () => {
  assert.equal(new Date(madridReminderTime('2026-10-24')).toISOString(), '2026-10-24T07:00:00.000Z');
  assert.equal(new Date(madridReminderTime('2026-10-25')).toISOString(), '2026-10-25T08:00:00.000Z');
  assert.equal(new Date(madridReminderTime('2026-03-29')).toISOString(), '2026-03-29T07:00:00.000Z');
  const reminders = planLocalReminders(input());
  assert.equal(reminders.length, 3);
  assert.ok(reminders.some(item => item.dedupeKey === 'special-date:d:2026-10-04:2'));
  assert.ok(reminders.some(item => item.content.data.screen === 'Planes'));
  assert.equal(JSON.stringify(reminders).includes('privad'), false);
});

test('recordatorios: caducados, planes completados, otra pareja, límites y 29 de febrero', () => {
  const f = input();
  f.now = Date.parse('2026-10-02T10:00:00Z');
  f.plans[0].status = 'completed';
  assert.equal(planLocalReminders(f).length, 1);
  f.dates[0].couple_id = 'other';
  assert.equal(planLocalReminders(f).length, 0);
  f.dates = [{ id: 'leap', couple_id: 'c', title: 'Fecha', date: '2024-02-29', recurring: true, notify_days_before: 0 }];
  assert.match(planLocalReminders(f)[0].dedupeKey, /2027-02-28:0$/);
  f.settings.dates_enabled = false;
  assert.equal(planLocalReminders(f).length, 0);
  const many = input();
  many.plans = Array.from({ length: 100 }, (_, id) => ({ ...many.plans[0], id: String(id) }));
  assert.equal(planLocalReminders(many).length, 40);
});

test('recordatorios: reconcilia sin repetir, cancela ediciones y preserva avisos ajenos', async () => {
  const desired = planLocalReminders(input()), handled = {}, sent = [], canceled = [];
  const deps = { desired, scheduled: [], handled, now, isCurrent: () => true,
    schedule: async request => sent.push(request), cancel: async id => canceled.push(id) };
  await reconcileLocalReminders(deps);
  assert.equal(sent.length, 3);
  assert.ok(handled['special-date:d:2026-10-04:2']);
  deps.scheduled = [...sent, { identifier: 'another-feature', content: { data: {} } }];
  await reconcileLocalReminders(deps);
  assert.equal(sent.length, 3);
  deps.desired = [];
  await reconcileLocalReminders(deps);
  assert.equal(canceled.length, 3);
  assert.equal(Object.keys(handled).length, 0);
  assert.ok(!canceled.includes('another-feature'));
});

test('recordatorios: un cambio de cuenta durante el alta retira el aviso en curso', async () => {
  let current = true;
  const canceled = [];
  await reconcileLocalReminders({ desired: planLocalReminders(input()), scheduled: [], handled: {}, now,
    isCurrent: () => current, schedule: async () => { current = false; }, cancel: async id => canceled.push(id) });
  assert.equal(canceled.length, 1);
});
