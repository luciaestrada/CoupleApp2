begin;
alter table public.memory_entries drop constraint if exists memory_entries_kind_check;
alter table public.memory_entries add constraint memory_entries_kind_check check(kind in ('plan','checkin'));
alter table public.memory_entries add column if not exists source_checkin_id uuid unique;

create table if not exists public.retired_memory_sources (
  couple_id uuid not null references public.couples(id) on delete cascade,
  kind text not null,
  source_id uuid not null,
  primary key(couple_id,kind,source_id)
);
alter table public.retired_memory_sources enable row level security;
revoke all on public.retired_memory_sources from public,anon,authenticated;
create or replace function public.enforce_retired_memory()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.retired_memory_sources where couple_id=new.couple_id and kind=new.kind
    and source_id=coalesce(new.source_plan_id,new.source_checkin_id)) then
    raise exception 'Este recuerdo fue retirado y no se recreará al reintentar' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.enforce_retired_memory() from public,anon,authenticated;
drop trigger if exists enforce_retired_memory on public.memory_entries;
create trigger enforce_retired_memory before insert on public.memory_entries for each row execute function public.enforce_retired_memory();

create or replace function public.remember_checkin(p_id uuid,p_expected_updated_at timestamptz,p_couple_id uuid,p_expected_user_id uuid)
returns public.memory_entries language plpgsql security definer set search_path=public as $$
declare item public.daily_checkins; result public.memory_entries; mood_label text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_couple_id is distinct from public.current_couple_id()
    or not public.is_complete_couple(p_couple_id) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  perform 1 from public.couples where id=p_couple_id for update;
  select * into result from public.memory_entries where source_checkin_id=p_id and couple_id=p_couple_id and author_id=auth.uid();
  if result.id is not null then return result; end if;
  select * into item from public.daily_checkins where id=p_id and user_id=auth.uid() and couple_id=p_couple_id for update;
  if item.id is null or item.expires_at<=now() then raise exception 'Check-in no disponible' using errcode='42501'; end if;
  if item.updated_at is distinct from p_expected_updated_at then raise exception 'El check-in cambió. Actualiza antes de guardarlo' using errcode='40001'; end if;
  mood_label:=case item.mood when 'happy' then 'Contento/a' when 'calm' then 'En calma' when 'tired' then 'Cansado/a'
    when 'sad' then 'Triste' when 'stressed' then 'Con estrés' else 'Ilusionado/a' end;
  insert into public.memory_entries(couple_id,author_id,kind,source_checkin_id,title,body,event_date)
    values(p_couple_id,auth.uid(),'checkin',item.id,'Cómo me sentía',mood_label||' · Energía '||item.energy||'/5'||
      case when item.phrase='' then '' else E'\n'||item.phrase end,item.local_day) returning * into result;
  return result;
end $$;
revoke all on function public.remember_checkin(uuid,timestamptz,uuid,uuid) from public;
grant execute on function public.remember_checkin(uuid,timestamptz,uuid,uuid) to authenticated;

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
  if coalesce(item.source_plan_id,item.source_checkin_id) is not null then
    insert into public.retired_memory_sources values(p_couple_id,item.kind,coalesce(item.source_plan_id,item.source_checkin_id)) on conflict do nothing;
  end if;
  delete from public.memory_entries where id=item.id;
  if item.source_plan_id is not null then update public.couple_plans set updated_at=now() where id=item.source_plan_id; end if;
end $$;
revoke all on function public.remove_memory(uuid,uuid,uuid) from public;
grant execute on function public.remove_memory(uuid,uuid,uuid) to authenticated;
create or replace function public.remember_couple_plan(p_plan_id uuid,p_expected_version integer,p_event_date date,p_couple_id uuid,p_expected_user_id uuid)
returns public.memory_entries language plpgsql security definer set search_path=public as $$
declare plan public.couple_plans; result public.memory_entries;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_couple_id is distinct from public.current_couple_id()
    or not public.is_complete_couple(p_couple_id) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  perform 1 from public.couples where id=p_couple_id for update;
  select * into plan from public.couple_plans where id=p_plan_id and couple_id=p_couple_id for update;
  if plan.id is null then raise exception 'Plan no disponible' using errcode='42501'; end if;
  select * into result from public.memory_entries where source_plan_id=plan.id;
  if result.id is not null then return result; end if;
  if plan.status<>'completed' or plan.version is distinct from p_expected_version or p_event_date is null then
    raise exception 'Completa el plan y actualízalo antes de crear el recuerdo' using errcode='22023'; end if;
  insert into public.memory_entries(couple_id,author_id,kind,source_plan_id,title,body,event_date)
    values(plan.couple_id,auth.uid(),'plan',plan.id,plan.title,plan.note,p_event_date) returning * into result;
  update public.couple_plans set updated_at=now() where id=plan.id;
  return result;
end $$;
revoke all on function public.remember_couple_plan(uuid,integer,date,uuid,uuid) from public;
grant execute on function public.remember_couple_plan(uuid,integer,date,uuid,uuid) to authenticated;

commit;
