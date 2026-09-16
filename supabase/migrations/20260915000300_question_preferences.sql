begin;
create table if not exists public.question_preferences (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  categories text[] not null default array['fun','romantic','deep','custom'],
  adult_consent_at timestamptz,
  primary key(couple_id,user_id),
  check(categories <@ array['fun','romantic','deep','custom','intimate']::text[])
);
alter table public.question_preferences enable row level security;
revoke all on public.question_preferences from anon,authenticated;
grant select on public.question_preferences to authenticated;
drop policy if exists question_preferences_read on public.question_preferences;
create policy question_preferences_read on public.question_preferences for select to authenticated
  using(user_id=auth.uid() and couple_id=public.current_couple_id());

create or replace function public.question_category_enabled(p_couple_id uuid,p_category text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_complete_couple(p_couple_id) and
    (select count(*)=2 from public.couple_members m left join public.question_preferences p on p.couple_id=m.couple_id and p.user_id=m.user_id
      where m.couple_id=p_couple_id and p_category=any(coalesce(p.categories,array['fun','romantic','deep','custom']))
        and (p_category<>'intimate' or p.adult_consent_at is not null));
$$;
revoke all on function public.question_category_enabled(uuid,text) from public,anon,authenticated;

create or replace function public.get_question_preferences()
returns jsonb language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id(); mine text[]; available text[];
begin
  if auth.uid() is null or c is null or not public.is_complete_couple(c) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  select categories into mine from public.question_preferences where couple_id=c and user_id=auth.uid();
  select coalesce(array_agg(category),array[]::text[]) into available from unnest(array['fun','romantic','deep','custom','intimate']) category
    where public.question_category_enabled(c,category);
  return jsonb_build_object('mine',coalesce(mine,array['fun','romantic','deep','custom']),'available',available);
end $$;
revoke all on function public.get_question_preferences() from public;
grant execute on function public.get_question_preferences() to authenticated;

create or replace function public.set_question_category(p_category text,p_enabled boolean,p_adult_confirmed boolean,p_expected_user_id uuid,p_couple_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_couple_id is distinct from public.current_couple_id()
    or not public.is_complete_couple(p_couple_id) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  if p_category is null or p_category not in ('fun','romantic','deep','custom','intimate') or p_enabled is null then raise exception 'Categoría no válida' using errcode='22023'; end if;
  if p_category='intimate' and p_enabled and p_adult_confirmed is distinct from true then
    raise exception 'Debes confirmar que eres mayor de edad y quieres activar esta categoría' using errcode='22023';
  end if;
  perform 1 from public.couples where id=p_couple_id for update;
  insert into public.question_preferences(couple_id,user_id) values(p_couple_id,auth.uid()) on conflict do nothing;
  update public.question_preferences set categories=case when p_enabled then array_append(array_remove(categories,p_category),p_category) else array_remove(categories,p_category) end,
    adult_consent_at=case when p_category='intimate' then case when p_enabled then now() else null end else adult_consent_at end
    where couple_id=p_couple_id and user_id=auth.uid();
  return public.get_question_preferences();
end $$;
revoke all on function public.set_question_category(text,boolean,boolean,uuid,uuid) from public;
grant execute on function public.set_question_category(text,boolean,boolean,uuid,uuid) to authenticated;

create or replace function public.enforce_question_category()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.question_category_enabled(new.couple_id,new.category) then raise exception 'Categoría no disponible para ambos' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function public.enforce_question_category() from public,anon,authenticated;
drop trigger if exists enforce_question_category on public.couple_daily_questions;
create trigger enforce_question_category before insert on public.couple_daily_questions for each row execute function public.enforce_question_category();

insert into public.question_bank(id,category,prompt) values
 ('a1150000-0000-4000-8000-000000000007','intimate','¿Qué gesto de cercanía física te resulta agradable y cómo prefieres pedirlo?'),
 ('a1150000-0000-4000-8000-000000000008','intimate','¿Qué límites y cuidados nos ayudan a sentirnos cómodos en nuestra intimidad?')
on conflict(id) do nothing;
create or replace function public.get_daily_question(p_category text default 'fun')
returns public.couple_daily_questions language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id(); day date:=(now() at time zone 'Europe/Madrid')::date;
  result public.couple_daily_questions; chosen public.question_bank;
begin
  if auth.uid() is null or c is null or not public.is_complete_couple(c) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  perform 1 from public.couples where id=c for update;
  select * into result from public.couple_daily_questions where couple_id=c and local_day=day;
  if result.id is not null then return result; end if;
  -- The insert trigger checks both members' category preferences.
  if p_category is null or p_category not in ('fun','romantic','deep','intimate') then raise exception 'Categoría no disponible' using errcode='22023'; end if;
  select * into chosen from public.question_bank where active and category=p_category and couple_id is null
    order by (select max(q.local_day) from public.couple_daily_questions q where q.couple_id=c and q.question_id=question_bank.id) asc nulls first,id limit 1;
  if chosen.id is null then raise exception 'No hay preguntas en esta categoría' using errcode='22023'; end if;
  insert into public.couple_daily_questions(couple_id,local_day,question_id,prompt,category,closes_at)
    values(c,day,chosen.id,chosen.prompt,chosen.category,(day+1)::timestamp at time zone 'Europe/Madrid') returning * into result;
  return result;
end $$;
revoke all on function public.get_daily_question(text) from public;
grant execute on function public.get_daily_question(text) to authenticated;

commit;
