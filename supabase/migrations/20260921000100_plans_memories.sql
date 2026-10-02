begin;
create table if not exists public.couple_plans (
  id uuid primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(char_length(title) between 1 and 160),
  category text not null default '' check(char_length(category)<=60),
  note text not null default '' check(char_length(note)<=4000),
  link text not null default '' check(char_length(link)<=2000 and (link='' or link ~ '^https?://[^[:space:]]+$')),
  planned_date date,
  status text not null default 'pending' check(status in ('pending','completed','archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists couple_plans_page on public.couple_plans(couple_id,created_at desc,id desc);
create table if not exists public.memory_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('plan')),
  source_plan_id uuid unique references public.couple_plans(id) on delete set null,
  title text not null check(char_length(title) between 1 and 160),
  body text not null default '' check(char_length(body)<=4000),
  event_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists memory_entries_page on public.memory_entries(couple_id,event_date desc,id desc);
alter table public.couple_plans enable row level security;
alter table public.memory_entries enable row level security;
revoke all on public.couple_plans,public.memory_entries from anon,authenticated;
grant select on public.couple_plans,public.memory_entries to authenticated;
drop policy if exists plans_read on public.couple_plans;
create policy plans_read on public.couple_plans for select to authenticated
  using(couple_id=public.current_couple_id() and public.is_complete_couple(couple_id));
drop policy if exists memories_read on public.memory_entries;
create policy memories_read on public.memory_entries for select to authenticated
  using(couple_id=public.current_couple_id() and public.is_complete_couple(couple_id));

create or replace function public.save_couple_plan(p_id uuid,p_couple_id uuid,p_expected_user_id uuid,p_expected_version integer,
  p_title text,p_category text,p_note text,p_link text,p_planned_date date,p_status text)
returns public.couple_plans language plpgsql security definer set search_path=public as $$
declare previous public.couple_plans; result public.couple_plans;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_couple_id is distinct from public.current_couple_id()
    or not public.is_complete_couple(p_couple_id) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  if p_id is null or p_expected_version is null or p_expected_version<0 or p_title is null or char_length(trim(p_title)) not between 1 and 160
    or p_category is null or char_length(p_category)>60 or p_note is null or char_length(p_note)>4000
    or p_link is null or char_length(p_link)>2000 or (p_link<>'' and p_link !~ '^https?://[^[:space:]]+$')
    or p_status is null or p_status not in ('pending','completed','archived') then raise exception 'Plan no válido' using errcode='22023'; end if;
  perform 1 from public.couples where id=p_couple_id for update;
  select * into previous from public.couple_plans where id=p_id for update;
  if previous.id is not null then
    if previous.couple_id<>p_couple_id then raise exception 'Plan no disponible' using errcode='42501'; end if;
    if row(previous.title,previous.category,previous.note,previous.link,previous.planned_date,previous.status)
      is not distinct from row(trim(p_title),trim(p_category),trim(p_note),p_link,p_planned_date,p_status) then return previous; end if;
    if previous.version<>p_expected_version then raise exception 'El plan cambió. Actualiza antes de editar' using errcode='40001'; end if;
    update public.couple_plans set title=trim(p_title),category=trim(p_category),note=trim(p_note),link=p_link,planned_date=p_planned_date,
      status=p_status,version=version+1,updated_at=now(),completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end
      where id=p_id returning * into result;
  else
    if p_expected_version<>0 then raise exception 'Plan no disponible' using errcode='42501'; end if;
    insert into public.couple_plans(id,couple_id,creator_id,title,category,note,link,planned_date,status,completed_at)
      values(p_id,p_couple_id,auth.uid(),trim(p_title),trim(p_category),trim(p_note),p_link,p_planned_date,p_status,
        case when p_status='completed' then now() else null end) returning * into result;
  end if;
  return result;
end $$;
revoke all on function public.save_couple_plan(uuid,uuid,uuid,integer,text,text,text,text,date,text) from public;
grant execute on function public.save_couple_plan(uuid,uuid,uuid,integer,text,text,text,text,date,text) to authenticated;

create or replace function public.remember_couple_plan(p_plan_id uuid,p_expected_version integer,p_event_date date,p_couple_id uuid,p_expected_user_id uuid)
returns public.memory_entries language plpgsql security definer set search_path=public as $$
declare plan public.couple_plans; result public.memory_entries;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_couple_id is distinct from public.current_couple_id()
    or not public.is_complete_couple(p_couple_id) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
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

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='couple_plans') then
    alter publication supabase_realtime add table public.couple_plans;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='memory_entries') then
    alter publication supabase_realtime add table public.memory_entries;
  end if;
end $$;
commit;
