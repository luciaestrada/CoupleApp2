import { supabase } from '../supabase/client';

const STATUS_DURATION_MS = 24 * 60 * 60 * 1000;

function normalizeStatus(profile) {
  if (!profile?.status_updated_at) return null;
  const updatedAt = new Date(profile.status_updated_at);
  if (updatedAt.getTime() + STATUS_DURATION_MS <= Date.now()) return null;
  return {
    text: profile.status_text || '',
    emoji: profile.status_emoji || '',
    updatedAt: profile.status_updated_at,
  };
}

export function watchStatus(_coupleId, userId, onChange) {
  let active = true;

  async function loadStatus() {
    const { data, error } = await supabase
      .from('profiles')
      .select('status_text,status_emoji,status_updated_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    if (active) onChange(normalizeStatus(data));
  }

  loadStatus().catch(console.error);
  const channel = supabase
    .channel(`status-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      ({ new: profile }) => onChange(normalizeStatus(profile))
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

export async function setMyStatus(_coupleId, userId, text, emoji) {
  const { error } = await supabase
    .from('profiles')
    .update({
      status_text: text,
      status_emoji: emoji || '',
      status_updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;
}
