import {supabase} from '../supabase/client';
import {watchQuery} from './realtimeService';
export async function loadMemories(coupleId,cursor=null,kind=null,featuredOnly=false) {
  let query=supabase.from('memory_entries').select('*').eq('couple_id',coupleId)
    .order('event_date',{ascending:false}).order('id',{ascending:false}).limit(50);
  if(cursor)query=query.or(`event_date.lt.${cursor.event_date},and(event_date.eq.${cursor.event_date},id.lt.${cursor.id})`);
  if(kind)query=query.eq('kind',kind);
  if(featuredOnly)query=query.eq('featured',true);
  const {data,error}=await query;
  if(error)throw error;
  return data;
}
export function watchMemories(coupleId,handlers,kind=null,featuredOnly=false) {
  return watchQuery({channelName:`memories-${coupleId}-${kind??'all'}-${featuredOnly}`,table:'memory_entries',filter:`couple_id=eq.${coupleId}`,
    load:()=>loadMemories(coupleId,null,kind,featuredOnly),...handlers});
}
export async function setMemoryFeatured(coupleId,userId,id,featured) {
  const {error}=await supabase.rpc('set_memory_featured',{p_id:id,p_featured:featured,p_couple_id:coupleId,p_expected_user_id:userId});
  if(error)throw error;
}
export async function rememberCheckin(coupleId,userId,checkin) {
  const {data,error}=await supabase.rpc('remember_checkin',{p_id:checkin.id,p_expected_updated_at:checkin.updated_at,p_couple_id:coupleId,p_expected_user_id:userId});
  if(error)throw error;
  return data;
}
export async function removeMemory(coupleId,userId,id) {
  const {error}=await supabase.rpc('remove_memory',{p_id:id,p_couple_id:coupleId,p_expected_user_id:userId});
  if(error)throw error;
}
export async function rememberQuestion(coupleId,userId,id) {
  const {data,error}=await supabase.rpc('remember_question',{p_id:id,p_couple_id:coupleId,p_expected_user_id:userId});
  if(error)throw error;
  return data;
}
