import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';

function normalizeStreak(member) {
  return {
    userId: member.user_id,
    count: member.love_streak_count,
    lastConfirmedDay: member.last_love_date,
  };
}

export function watchStreaks(coupleId, handlers) {
  return watchQuery({
    channelName: `streaks-${coupleId}`,
    table: 'couple_members',
    event: 'UPDATE',
    filter: `couple_id=eq.${coupleId}`,
    async load() {
      const { data, error } = await supabase
        .from('couple_members')
        .select('user_id,love_streak_count,last_love_date')
        .eq('couple_id', coupleId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return data.map(normalizeStreak);
    },
    ...handlers,
  });
}

export async function sendLove(coupleId) {
  const { data, error } = await supabase.rpc('send_love', { p_couple_id: coupleId });
  if (error) throw error;
  return data;
}
