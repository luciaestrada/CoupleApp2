import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
import { todayInMadrid } from '../utils/dateUtils';
export async function loadQuestion(coupleId,day=todayInMadrid()) {
  const {data:question,error}=await supabase.from('couple_daily_questions').select('*')
    .eq('couple_id',coupleId).eq('local_day',day).maybeSingle();
  if(error) throw error;
  if(!question) return {question:null,answers:[],preferences:await getQuestionPreferences()};
  const {data:answers,error:answerError}=await supabase.from('question_answers').select('user_id,answer,version').eq('question_id',question.id);
  if(answerError) throw answerError;
  const {data:skips,error:skipError}=await supabase.from('question_skips').select('user_id').eq('question_id',question.id);
  if(skipError) throw skipError;
  return {question,answers,skipped:skips.length>0};
}
export function watchDailyQuestion(coupleId,day,handlers) {
  return watchQuery({channelName:`daily-question-${coupleId}-${day}`,table:'couple_daily_questions',filter:`couple_id=eq.${coupleId}`,
    load:()=>loadQuestion(coupleId,day),...handlers});
}
export async function chooseDailyQuestion(category) {
  const {error}=await supabase.rpc('get_daily_question',{p_category:category});
  if(error) throw error;
}
export async function answerDailyQuestion(id,text,version) {
  const {error}=await supabase.rpc('answer_daily_question',{p_question_id:id,p_answer:text,p_expected_version:version});
  if(error) throw error;
}
export async function skipDailyQuestion(id,skip) {
  const {error}=await supabase.rpc('skip_daily_question',{p_question_id:id,p_skip:skip});
  if(error) throw error;
}
export async function createCustomQuestion(coupleId,userId,day,prompt) {
  const {error}=await supabase.rpc('create_custom_daily_question',{
    p_couple_id:coupleId,p_expected_user_id:userId,p_expected_day:day,p_prompt:prompt,
  });
  if(error) throw error;
}
export async function getQuestionPreferences() {
  const {data,error}=await supabase.rpc('get_question_preferences');
  if(error) throw error;
  return data;
}
export async function setQuestionCategory(coupleId,userId,category,enabled,adultConfirmed=false) {
  const {data,error}=await supabase.rpc('set_question_category',{
    p_couple_id:coupleId,p_expected_user_id:userId,p_category:category,p_enabled:enabled,p_adult_confirmed:adultConfirmed,
  });
  if(error) throw error;
  return data;
}
