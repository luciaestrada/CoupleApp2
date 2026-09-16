import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';

const STATUS_DURATION_MS = 24 * 60 * 60 * 1000;

function normalizeStatus(profile) {
  if (!profile?.status_updated_at) return null;
  const updatedAt = new Date(profile.status_updated_at);
  const expiresAt = profile.status_expires_at ? Date.parse(profile.status_expires_at) : updatedAt.getTime() + STATUS_DURATION_MS;
  if (expiresAt <= Date.now()) return null;
  return {
    text: profile.status_text,
    emoji: profile.status_emoji,
    updatedAt: profile.status_updated_at,
    expiresAt,
  };
}

export function watchStatus(coupleId, userId, handlers) {
  let expirationTimer;
  const stopWatching = watchQuery({
    channelName: `status-${coupleId}-${userId}`,
    table: 'profiles',
    event: 'UPDATE',
    filter: `id=eq.${userId}`,
    async load() {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return normalizeStatus(data);
    },
    onData: (status) => {
      clearTimeout(expirationTimer);
      handlers.onData(status);
      if (status) {
        expirationTimer = setTimeout(
          () => handlers.onData(null),
          Math.max(0, status.expiresAt - Date.now())
        );
      }
    },
    onError: handlers.onError,
  });

  return () => {
    clearTimeout(expirationTimer);
    stopWatching();
  };
}

export async function setMyStatus(text, emoji) {
  const { error } = await supabase.rpc('set_status', {
    p_text: text.trim(),
    p_emoji: emoji,
  });
  if (error) throw error;
}

export function clearMyStatus() {
  return setMyStatus('', '');
}
