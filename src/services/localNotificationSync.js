import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';
import { supabase } from '../supabase/client';
import { getNotificationPermission } from './permissionService';
import { createLocalNotificationDelivery } from './localNotificationDelivery';
import { planLocalReminders, reconcileLocalReminders, REMINDER_PREFIX } from './localReminderPlanner';
import { todayInMadrid } from '../utils/dateUtils';
import { notificationFailureReason, recordNotificationDiagnostic } from './notificationDiagnostics';
import { navigationRef } from '../navigation/navigationService';

const OWNER_KEY = 'coupleapp.notifications.owner';
let revision = 0;
let serial = Promise.resolve();
let lastLocationSync = 0;
const pending = new Map();
let runningController;
let runningSource;
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { const error = new Error('Notification sync timed out'); error.name = 'AbortError'; reject(error); };
    if (signal.aborted) { void Promise.resolve(promise).catch(() => {}); abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
const enqueue = work => {
  const result = serial.then(work);
  serial = result.catch(() => {});
  return result;
};
export const localNotificationUser = () => localStorage.getItem(OWNER_KEY);
export function interruptLocalNotificationSync() {
  revision++;
  runningController?.abort();
}
export function setLocalNotificationUser(userId) {
  if (localNotificationUser() === userId) return;
  interruptLocalNotificationSync();
  lastLocationSync = 0;
  if (userId) localStorage.setItem(OWNER_KEY, userId);
  else localStorage.removeItem(OWNER_KEY);
}
async function cancelReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter(item => item.identifier.startsWith(REMINDER_PREFIX))
    .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  for (const item of scheduled) {
    const { userId, dedupeKey } = item.content.data ?? {};
    if (!item.identifier.startsWith(REMINDER_PREFIX) || !userId || !dedupeKey) continue;
    const key = `coupleapp.reminders.handled.${userId}`;
    try {
      const handled = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (handled[dedupeKey]?.at > Date.now()) delete handled[dedupeKey];
      localStorage.setItem(key, JSON.stringify(handled));
    } catch { localStorage.removeItem(key); }
  }
}
export function clearLocalReminders() {
  if (Platform.OS !== 'ios') return Promise.resolve();
  interruptLocalNotificationSync();
  return enqueue(cancelReminders);
}
export function syncLocalNotifications({ source = 'foreground', userId = localNotificationUser(), isCurrent = () => true, currentRoute = () => navigationRef.getCurrentRoute()?.name } = {}) {
  if (Platform.OS !== 'ios' || !userId || userId !== localNotificationUser()) return Promise.resolve();
  if (source === 'location') {
    if (Date.now() - lastLocationSync < 60000) return Promise.resolve();
    lastLocationSync = Date.now();
  }
  const generation = revision;
  // A foreground request may be waiting on auth/network when iOS gives a short
  // background execution window. Cancel it so it cannot block that window.
  if (source !== 'foreground' && runningSource === 'foreground') runningController?.abort();
  const key = `${userId}:${source}:${generation}`;
  if (pending.has(key)) return pending.get(key);
  const result = enqueue(async () => {
    const valid = () => generation === revision && localNotificationUser() === userId && isCurrent();
    if (!valid()) return;
    if (source === 'foreground' && ['background', 'location'].some(origin => pending.has(`${userId}:${origin}:${generation}`))) return;
    const controller = new AbortController();
    runningController = controller;
    runningSource = source;
    recordNotificationDiagnostic(userId, source, 'started');
    const timer = setTimeout(() => controller.abort(), source === 'foreground' ? 15000 : 10000);
    const live = () => valid() && !controller.signal.aborted;
    try {
      let { data: { session }, error } = await abortable(supabase.auth.getSession(), controller.signal);
      if (error) throw error;
      if (!live()) return;
      if (session?.user.id !== userId) { recordNotificationDiagnostic(userId, source, 'skipped', { reason: 'session' }); return; }
      if (session.expires_at * 1000 < Date.now() + 60000) {
        const refreshed = await abortable(supabase.auth.refreshSession(), controller.signal);
        if (refreshed.error) throw refreshed.error;
        session = refreshed.data.session;
        if (!live()) return;
        if (session?.user.id !== userId) { recordNotificationDiagnostic(userId, source, 'skipped', { reason: 'session' }); return; }
      }
      const permission = await abortable(getNotificationPermission(), controller.signal);
      if (!live()) return;
      if (!permission.granted) {
        recordNotificationDiagnostic(userId, source, 'skipped', { reason: 'permission' });
        await abortable(cancelReminders(), controller.signal);
        return;
      }
      let handled;
      const handledKey = `coupleapp.reminders.handled.${userId}`;
      try { handled = JSON.parse(localStorage.getItem(handledKey) ?? '{}'); } catch { handled = {}; }
      if (!handled || typeof handled !== 'object' || Array.isArray(handled)) handled = {};
      const delivery = createLocalNotificationDelivery({
        userId, storage: localStorage, isActive: live,
        currentUser: async () => (await abortable(supabase.auth.getSession(), controller.signal)).data.session?.user.id,
        permission: () => abortable(getNotificationPermission(), controller.signal),
        currentRoute: () => AppState.currentState === 'active' ? currentRoute() : null,
        isHandled: row => !!handled[row.dedupe_key],
        schedule: request => abortable(Notifications.scheduleNotificationAsync(request), controller.signal),
      });
      const [inbox, preferences] = await abortable(Promise.all([
        supabase.from('notifications').select('id,user_id,title,body,kind,data,dedupe_key,read_at,created_at,expires_at,push_enabled_at_creation')
          .eq('user_id', userId).is('read_at', null).gte('created_at', delivery.since())
          .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(100).abortSignal(controller.signal),
        supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle().abortSignal(controller.signal),
      ]), controller.signal);
      for (const result of [inbox, preferences]) if (result.error) throw result.error;
      if (!live()) return;
      const settings = preferences.data;
      // Present messages before any calendar, plan or native scheduling work.
      // Date notifications wait for reminder reconciliation to avoid duplicates.
      await delivery.deliver({ rows: (inbox.data ?? []).filter(row => row.kind !== 'dates'), settings });
      if (!live()) return;
      recordNotificationDiagnostic(userId, source, 'success', { appState: AppState.currentState });
      localStorage.setItem('coupleapp.notifications.lastSync', JSON.stringify({ at: Date.now(), source }));
      try {
        const coupleResult = await abortable(supabase.rpc('get_my_couple').abortSignal(controller.signal), controller.signal);
        if (coupleResult.error) throw coupleResult.error;
        const couple = coupleResult.data;
        let dates = [], plans = [], reminderError;
        if (settings?.notifications_enabled && settings.dates_enabled && couple?.members?.length === 2) {
          const results = await abortable(Promise.all([
            supabase.from('special_dates').select('id,couple_id,title,date,recurring,notify_days_before').eq('couple_id', couple.id).limit(500).abortSignal(controller.signal),
            supabase.from('couple_plans').select('id,couple_id,title,planned_date,status,version').eq('couple_id', couple.id).eq('status', 'pending')
              .gte('planned_date', todayInMadrid()).order('planned_date', { ascending: true }).limit(100).abortSignal(controller.signal),
          ]), controller.signal);
          reminderError = results.find(result => result.error)?.error;
          if (!reminderError) { dates = results[0].data ?? []; plans = results[1].data ?? []; }
        }
        if (!live()) return;
        if (!reminderError) {
          await abortable(reconcileLocalReminders({
            desired: planLocalReminders({ userId, coupleId: couple?.members?.length === 2 ? couple.id : null, dates, plans, settings }),
            scheduled: await abortable(Notifications.getAllScheduledNotificationsAsync(), controller.signal),
            schedule: request => Notifications.scheduleNotificationAsync(request),
            cancel: id => Notifications.cancelScheduledNotificationAsync(id),
            isCurrent: live, handled,
            saveHandled: () => { if (live()) localStorage.setItem(handledKey, JSON.stringify(handled)); },
          }), controller.signal);
          if (live()) localStorage.setItem(handledKey, JSON.stringify(handled));
        }
        await delivery.deliver({ rows: inbox.data ?? [], settings });
        if (reminderError) throw reminderError;
      } catch (error) {
        // Calendar failure must not turn a successful message sync into a failed
        // native task or delay subsequent delivery opportunities.
        if (valid()) recordNotificationDiagnostic(userId, source, 'reminder_error', { reason: notificationFailureReason(error) });
      }
    } catch (error) {
      if (!valid()) return;
      recordNotificationDiagnostic(userId, source, 'error', { reason: notificationFailureReason(error) });
      throw error;
    } finally {
      clearTimeout(timer);
      if (runningController === controller) { runningController = null; runningSource = null; }
    }
  });
  pending.set(key, result);
  void result.finally(() => pending.delete(key)).catch(() => {});
  return result;
}
