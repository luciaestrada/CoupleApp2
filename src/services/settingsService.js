import { supabase } from '../supabase/client';
import { getDeviceId } from './deviceService';
import { watchQuery } from './realtimeService';

export const DEFAULT_SETTINGS = Object.freeze({
  location_mode: 'off',
  history_enabled: false,
  background_enabled: false,
  notifications_enabled: true,
  chat_enabled: true,
  love_enabled: true,
  geofence_enabled: true,
  dates_enabled: true,
  stories_enabled: false,
  preview_enabled: false,
});

export function watchSettings(userId, handlers) {
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
      return data ?? DEFAULT_SETTINGS;
    },
    ...handlers,
  });
}

export async function saveSettings(settings) {
  const { data, error } = await supabase.rpc('save_settings', {
    p_settings: settings,
    p_device_id: getDeviceId(),
  });
  if (error) throw error;
  return data;
}
