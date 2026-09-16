begin;
create or replace function public.create_custom_daily_question(p_couple_id uuid,p_expected_user_id uuid,p_expected_day date,p_prompt text)
returns public.couple_daily_questions language plpgsql security definer set search_path=public as $$
declare day date:=(now() at time zone 'Europe/Madrid')::date; result public.couple_daily_questions;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_couple_id is distinct from public.current_couple_id()
    or not public.is_complete_couple(p_couple_id) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  if p_expected_day is distinct from day then raise exception 'El día ha cambiado. Actualiza la pregunta' using errcode='22023'; end if;
  if p_prompt is null or char_length(trim(p_prompt)) not between 1 and 500 then raise exception 'Escribe una pregunta de hasta 500 caracteres' using errcode='22023'; end if;
  perform 1 from public.couples where id=p_couple_id for update;
  select * into result from public.couple_daily_questions where couple_id=p_couple_id and local_day=day;
  if result.id is not null then
    if result.category='custom' and result.prompt=trim(p_prompt) then return result; end if;
    raise exception 'Ya hay una pregunta elegida para hoy' using errcode='22023';
  end if;
  insert into public.couple_daily_questions(couple_id,local_day,prompt,category,closes_at)
    values(p_couple_id,day,trim(p_prompt),'custom',(day+1)::timestamp at time zone 'Europe/Madrid') returning * into result;
  return result;
end $$;
revoke all on function public.create_custom_daily_question(uuid,uuid,date,text) from public;
grant execute on function public.create_custom_daily_question(uuid,uuid,date,text) to authenticated;
commit;
