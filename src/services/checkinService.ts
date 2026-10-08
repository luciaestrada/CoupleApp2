import type { Handlers, Row } from '../types/domain';
import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
export const MOODS = [
  ['happy','😊','Contento/a'], ['calm','😌','En calma'], ['tired','😴','Cansado/a'],
  ['sad','😔','Triste'], ['stressed','😣','Con estrés'], ['excited','🤩','Ilusionado/a'],
];
export function watchCheckins(coupleId: string, handlers: Handlers<Row<'daily_checkins'>[]>) {
  return watchQuery({ channelName:`checkins-${coupleId}`, table:'daily_checkins', filter:`couple_id=eq.${coupleId}`,
    async load() {
      const { data, error } = await supabase.from('daily_checkins').select('*').eq('couple_id',coupleId).gt('expires_at',new Date().toISOString());
      if (error) throw error;
      return data;
    }, ...handlers });
}
export function watchCheckinResponses(checkinId: string, handlers: Handlers<Pick<Row<'checkin_responses'>, 'user_id' | 'text'>[]>) {
  return watchQuery({ channelName:`checkin-responses-${checkinId}`, table:'checkin_responses', filter:`checkin_id=eq.${checkinId}`,
    async load() {
      const { data, error } = await supabase.from('checkin_responses').select('user_id,text').eq('checkin_id',checkinId);
      if (error) throw error;
      return data;
    }, ...handlers });
}
export async function saveCheckin(mood: string,energy: number,phrase: string) {
  const { data,error } = await supabase.rpc('save_daily_checkin',{p_mood:mood,p_energy:energy,p_phrase:phrase});
  if(error) throw error;
  return data;
}
export async function respondCheckin(id: string,text: string) {
  const { error } = await supabase.rpc('respond_daily_checkin',{p_checkin_id:id,p_text:text});
  if(error) throw error;
}
export async function clearCheckin(id: string) {
  const { error } = await supabase.rpc('clear_daily_checkin',{p_checkin_id:id});
  if(error) throw error;
}
