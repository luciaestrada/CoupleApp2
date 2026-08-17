import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';

export function normalizeProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatar_url,
    status: {
      text: profile.status_text,
      emoji: profile.status_emoji,
      updatedAt: profile.status_updated_at,
    },
  };
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,avatar_url,status_text,status_emoji,status_updated_at')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return normalizeProfile(data);
}

export function watchProfile(userId, handlers) {
  return watchQuery({
    channelName: `profile-${userId}`,
    table: 'profiles',
    event: 'UPDATE',
    filter: `id=eq.${userId}`,
    load: () => getProfile(userId),
    ...handlers,
  });
}
