import { supabase } from '../supabase/client';

function normalizeStreak(couple) {
  return {
    count: couple?.streak_count || 0,
    lastConfirmedDay: couple?.last_completed_date || null,
  };
}

export function watchStreak(coupleId, onChange) {
  let active = true;

  async function loadStreak() {
    const { data, error } = await supabase
      .from('couples')
      .select('streak_count,last_completed_date')
      .eq('id', coupleId)
      .single();
    if (error) throw error;
    if (active) onChange(normalizeStreak(data));
  }

  loadStreak().catch(console.error);
  const channel = supabase
    .channel(`streak-${coupleId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${coupleId}` },
      ({ new: nextCouple }) => onChange(normalizeStreak(nextCouple))
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

export async function sendLove(coupleId) {
  const { data, error } = await supabase.rpc('send_love', { p_couple_id: coupleId });
  if (error) throw error;
  return data;
}
