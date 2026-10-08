import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
import type { Handlers, Profile, Row } from '../types/domain';

export function normalizeProfile(profile: Row<'profiles'>): Profile {
  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatar_url,
    status: {
      text: profile.status_text,
      emoji: profile.status_emoji,
      updatedAt: profile.status_updated_at,
      expiresAt: profile.status_expires_at ?? (profile.status_updated_at ? new Date(Date.parse(profile.status_updated_at)+86400000).toISOString() : null),
    },
  };
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  const profile = normalizeProfile(data);
  if (data.avatar_url && !data.avatar_url.startsWith('https://')) {
    const { data: signed, error: signedError } = await supabase.storage
      .from('avatars')
      .createSignedUrl(data.avatar_url, 3600);
    if (signedError) throw signedError;
    profile.avatarUrl = signed.signedUrl;
  }
  return profile;
}

export function watchProfile(userId: string, handlers: Handlers<Profile>) {
  return watchQuery({
    channelName: `profile-${userId}`,
    table: 'profiles',
    event: 'UPDATE',
    filter: `id=eq.${userId}`,
    load: () => getProfile(userId),
    ...handlers,
  });
}
