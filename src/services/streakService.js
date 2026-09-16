import { supabase } from '../supabase/client';
import * as Crypto from 'expo-crypto';
import { watchQuery } from './realtimeService';
import { feedbackForSentGesture } from './affectionFeedbackService';

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

export async function sendLove(coupleId, kind = 'love') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Vuelve a iniciar sesión.');
  const key = `coupleapp.affection.${session.user.id}.${coupleId}.${kind}`;
  let id = localStorage.getItem(key);
  if (!id) { id = Crypto.randomUUID(); localStorage.setItem(key,id); }
  let { data, error } = await supabase.rpc('send_affection', { p_couple_id: coupleId, p_client_id: id, p_kind: kind });
  if (error?.code === 'PGRST202' && kind === 'love') {
    ({ data, error } = await supabase.rpc('send_love_v2', { p_couple_id: coupleId, p_client_id: id }));
  }
  if (error) throw error;
  if (localStorage.getItem(key) === id) localStorage.removeItem(key);
  if (data?.sentNow) void feedbackForSentGesture(session.user.id,coupleId);
  return data;
}
