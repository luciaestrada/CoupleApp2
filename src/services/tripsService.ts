import { supabase } from '../supabase/client';
export async function getTrip(id: string) {
  const {data,error}=await supabase.from('trips').select('id,started_at,ended_at,distance_m,points,end_reason').eq('id',id).maybeSingle();
  if(error) throw error;
  return data;
}
