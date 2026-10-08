import { supabase } from '../supabase/client';
import { getDeviceId } from './deviceService';
import { watchQuery } from './realtimeService';
import { createPrivacyQueue } from '../features/location/privacyQueue';
import { clearLocalReminders, syncLocalNotifications } from './localNotificationSync';
import type { Settings, SettingsChange, LocationOptions, EventOptions, Handlers, Row } from '../types/domain';
import { isRecord } from '../persistence/storage';

async function currentUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}
const privacyQueue = createPrivacyQueue({
  storage: {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: key => localStorage.removeItem(key),
  },
  currentUser: currentUserId,
  async send(userId, pauseLocation) {
    const { data, error } = await supabase.rpc('set_place_sharing', {
      p_enabled: false, p_pause_location: pauseLocation, p_expected_user_id: userId,
    });
    if (error) throw error;
    return normalizeSettings(data);
  },
});
export function flushPendingPrivacy(userId: string) { return privacyQueue.flush(userId); }
export function hasPendingPrivacy(userId: string) { return !!privacyQueue.pending(userId); }

export const DEFAULT_LOCATION_OPTIONS = Object.freeze<LocationOptions>({ normal_distance: 50, normal_interval: 120,
  live_interval: 20, battery_threshold: 20, low_battery_mode: 'balanced',
  share_battery: true, share_activity: true, save_trips: true, motion_assist: true });
export const DEFAULT_EVENT_OPTIONS = Object.freeze<EventOptions>({ enter: true, exit: true, walking: true,
  cycling: true, driving: true, stationary: false, trip: true });

export const DEFAULT_SETTINGS = Object.freeze<Settings>({
  location_mode: 'off',
  history_enabled: false,
  background_enabled: false,
  auto_live_enabled: false,
  notifications_enabled: true,
  chat_enabled: true,
  love_enabled: true,
  geofence_enabled: true,
  dates_enabled: true,
  stories_enabled: false,
  preview_enabled: false,
  location_options: DEFAULT_LOCATION_OPTIONS,
  event_options: DEFAULT_EVENT_OPTIONS,
});

export function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  const source = value as Partial<Row<'user_settings'>>;
  const location = isRecord(source.location_options) ? source.location_options : {};
  const events = isRecord(source.event_options) ? source.event_options : {};
  const numeric = (key: keyof LocationOptions, fallback: number) =>
    typeof location[key] === 'number' && Number.isFinite(location[key]) ? location[key] as number : fallback;
  return { ...DEFAULT_SETTINGS, ...source,
    location_mode: source.location_mode === 'live' || source.location_mode === 'balanced' ? source.location_mode : 'off',
    location_options: {
      normal_distance: numeric('normal_distance', 50), normal_interval: numeric('normal_interval', 120),
      live_interval: numeric('live_interval', 20), battery_threshold: numeric('battery_threshold', 20),
      low_battery_mode: location.low_battery_mode === 'off' || location.low_battery_mode === 'live' ? location.low_battery_mode : 'balanced',
      share_battery: location.share_battery !== false, share_activity: location.share_activity !== false,
      save_trips: location.save_trips !== false, motion_assist: location.motion_assist !== false,
    },
    event_options: { enter: events.enter !== false, exit: events.exit !== false,
      walking: events.walking !== false, cycling: events.cycling !== false, driving: events.driving !== false,
      stationary: events.stationary === true, trip: events.trip !== false },
  };
}

export function watchSettings(userId: string, handlers: Handlers<Settings>) {
  return watchQuery({
    channelName: `settings-${userId}`,
    table: 'user_settings',
    filter: `user_id=eq.${userId}`,
    async load() {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return normalizeSettings(data);
    },
    ...handlers,
  });
}

export async function saveSettings(settings: SettingsChange): Promise<Settings> {
  if (typeof settings.approximate_place_events === 'boolean') {
    const { data, error } = await supabase.rpc('set_approximate_place_events', { p_enabled: settings.approximate_place_events });
    if (error) throw error;
    return normalizeSettings(data);
  }
  if (typeof settings.shared_precision === 'string') {
    const { data, error } = await supabase.rpc('set_shared_precision', { p_precision: settings.shared_precision });
    if (error) throw error;
    return normalizeSettings(data);
  }
  if ('geofence_paused' in settings) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Vuelve a iniciar sesión para guardar la pausa.');
    if (settings.geofence_paused) {
      privacyQueue.enqueue(userId, settings.location_mode === 'off');
      const value = await privacyQueue.flush(userId);
      if (!value) throw new Error('La sesión cambió. La pausa queda pendiente en la cuenta original.');
      return value;
    }
    // Do not let a delayed queued pause overtake an explicit online resume.
    await privacyQueue.flush(userId);
    const { data, error } = await supabase.rpc('set_place_sharing', {
      p_enabled: !settings.geofence_paused,
      p_pause_location: settings.location_mode === 'off',
      p_expected_user_id: userId,
    });
    if (error) throw error;
    return normalizeSettings(data);
  }
  if (settings.location_mode && settings.location_mode !== 'off') {
    const userId = await currentUserId();
    if (!userId) throw new Error('Vuelve a iniciar sesión.');
    await privacyQueue.flush(userId);
  }
  if (settings.location_options || settings.event_options) {
    const { data, error } = await supabase.rpc('save_behavior_options', {
      p_location: settings.location_options ?? {}, p_events: settings.event_options ?? {},
    });
    if (error) throw error;
    return normalizeSettings(data);
  }
  if (typeof settings.auto_live_enabled === 'boolean') {
    const { data, error } = await supabase.rpc('set_auto_live_enabled', {
      p_enabled: settings.auto_live_enabled,
    });
    if (error) throw error;
    return normalizeSettings(data);
  }
  const { data, error } = await supabase.rpc('save_settings', {
    p_settings: { ...settings, location_options: undefined, event_options: undefined },
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
  if (['notifications_enabled', 'dates_enabled', 'preview_enabled'].some(key => key in settings)) {
    await clearLocalReminders();
    void syncLocalNotifications().catch(() => {});
  }
  return normalizeSettings(data);
}
