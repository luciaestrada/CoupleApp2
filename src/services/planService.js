import * as Crypto from 'expo-crypto';
import {supabase} from '../supabase/client';
import {watchQuery} from './realtimeService';
import {parseCalendarDate} from '../utils/validation';
import {clearLocalReminders,syncLocalNotifications} from './localNotificationSync';

const draftKey=(userId,coupleId)=>`coupleapp.plan-draft.${userId}.${coupleId}`;
export function readPlanDraft(userId,coupleId) {
  try {return JSON.parse(localStorage.getItem(draftKey(userId,coupleId))??'null');} catch {return null;}
}
export function writePlanDraft(userId,coupleId,value) {
  if(value) localStorage.setItem(draftKey(userId,coupleId),JSON.stringify(value));
  else localStorage.removeItem(draftKey(userId,coupleId));
}
export function newPlanDraft() {
  return {id:Crypto.randomUUID(),version:0,title:'',category:'',note:'',link:'',planned_date:'',status:'pending'};
}
export async function loadPlans(coupleId,cursor=null) {
  let query=supabase.from('couple_plans').select('*').eq('couple_id',coupleId)
    .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(50);
  if(cursor) query=query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
  const {data,error}=await query;
  if(error) throw error;
  if(!data.length)return data;
  const {data:memories,error:memoryError}=await supabase.from('memory_entries').select('id,source_plan_id,title,body,event_date')
    .eq('couple_id',coupleId).in('source_plan_id',data.map(plan=>plan.id));
  if(memoryError)throw memoryError;
  return data.map(plan=>({...plan,memory:memories.find(memory=>memory.source_plan_id===plan.id)??null}));
}
export async function getPlan(coupleId,id) {
  const {data,error}=await supabase.from('couple_plans').select('*').eq('couple_id',coupleId).eq('id',id).single();
  if(error)throw error;
  return data;
}
export function watchPlans(coupleId,handlers) {
  return watchQuery({channelName:`plans-${coupleId}`,table:'couple_plans',filter:`couple_id=eq.${coupleId}`,
    load:()=>loadPlans(coupleId),...handlers});
}
export async function savePlan(coupleId,userId,plan) {
  const date=plan.planned_date?parseCalendarDate(plan.planned_date):null;
  if(plan.planned_date && !date) throw new Error('Escribe una fecha válida: DD/MM/AAAA.');
  if(plan.link && !/^https?:\/\/\S+$/i.test(plan.link)) throw new Error('El enlace debe empezar por https:// o http://.');
  const {data,error}=await supabase.rpc('save_couple_plan',{
    p_id:plan.id,p_couple_id:coupleId,p_expected_user_id:userId,p_expected_version:plan.version,
    p_title:plan.title,p_category:plan.category,p_note:plan.note,p_link:plan.link,p_planned_date:date,p_status:plan.status,
  });
  if(error) throw error;
  await clearLocalReminders();
  void syncLocalNotifications().catch(()=>{});
  return data;
}
export async function rememberPlan(coupleId,userId,plan,eventDate) {
  const date=parseCalendarDate(eventDate);
  if(!date) throw new Error('Escribe una fecha válida para el recuerdo: DD/MM/AAAA.');
  const {data,error}=await supabase.rpc('remember_couple_plan',{
    p_plan_id:plan.id,p_expected_version:plan.version,p_event_date:date,p_couple_id:coupleId,p_expected_user_id:userId,
  });
  if(error) throw error;
  return data;
}
