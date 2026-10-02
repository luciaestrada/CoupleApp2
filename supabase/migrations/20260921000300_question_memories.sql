begin;
alter table public.memory_entries drop constraint if exists memory_entries_kind_check;
alter table public.memory_entries add constraint memory_entries_kind_check check(kind in ('plan','checkin','question'));
alter table public.memory_entries drop constraint if exists memory_entries_body_check;
alter table public.memory_entries add constraint memory_entries_body_check check(char_length(body)<=6000);
alter table public.memory_entries add column if not exists source_question_id uuid unique;

create or replace function public.remember_question(p_id uuid,p_couple_id uuid,p_expected_user_id uuid)
returns public.memory_entries language plpgsql security definer set search_path=public as $$
declare q public.couple_daily_questions; result public.memory_entries; answers_text text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_couple_id is distinct from public.current_couple_id()
    or not public.is_complete_couple(p_couple_id) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  perform 1 from public.couples where id=p_couple_id for update;
  select * into result from public.memory_entries where source_question_id=p_id and couple_id=p_couple_id;
  if result.id is not null then return result; end if;
  select * into q from public.couple_daily_questions where id=p_id and couple_id=p_couple_id for update;
  if q.id is null or q.revealed_at is null then raise exception 'Solo podéis guardar preguntas con ambas respuestas reveladas' using errcode='42501'; end if;
  select string_agg(coalesce(nullif(p.name,''),'Persona')||': '||a.answer,E'\n\n' order by a.user_id) into answers_text
    from public.question_answers a join public.profiles p on p.id=a.user_id where a.question_id=q.id;
  if (select count(*) from public.question_answers where question_id=q.id)<>2 then raise exception 'Respuestas no disponibles' using errcode='42501'; end if;
  insert into public.memory_entries(couple_id,author_id,kind,source_question_id,title,body,event_date)
    values(p_couple_id,auth.uid(),'question',q.id,'Nuestra pregunta del día',q.prompt||E'\n\n'||answers_text,q.local_day) returning * into result;
  return result;
end $$;
revoke all on function public.remember_question(uuid,uuid,uuid) from public;
grant execute on function public.remember_question(uuid,uuid,uuid) to authenticated;
create or replace function public.enforce_retired_memory()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.retired_memory_sources where couple_id=new.couple_id and kind=new.kind
    and source_id=coalesce(new.source_plan_id,new.source_checkin_id,new.source_question_id)) then
    raise exception 'Este recuerdo fue retirado y no se recreará al reintentar' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.enforce_retired_memory() from public,anon,authenticated;
create or replace function public.remove_memory(p_id uuid,p_couple_id uuid,p_expected_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare item public.memory_entries;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_couple_id is distinct from public.current_couple_id()
    or not public.is_complete_couple(p_couple_id) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  perform 1 from public.couples where id=p_couple_id for update;
  select * into item from public.memory_entries where id=p_id and couple_id=p_couple_id for update;
  if item.id is null then return; end if;
  if item.author_id<>auth.uid() then raise exception 'Solo quien guardó el recuerdo puede retirarlo' using errcode='42501'; end if;
  if coalesce(item.source_plan_id,item.source_checkin_id,item.source_question_id) is not null then
    insert into public.retired_memory_sources values(p_couple_id,item.kind,coalesce(item.source_plan_id,item.source_checkin_id,item.source_question_id)) on conflict do nothing;
  end if;
  delete from public.memory_entries where id=item.id;
  if item.source_plan_id is not null then update public.couple_plans set updated_at=now() where id=item.source_plan_id; end if;
end $$;
revoke all on function public.remove_memory(uuid,uuid,uuid) from public;
grant execute on function public.remove_memory(uuid,uuid,uuid) to authenticated;
commit;
