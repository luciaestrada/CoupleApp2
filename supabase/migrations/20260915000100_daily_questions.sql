begin;
create table if not exists public.question_bank (
  id uuid primary key default extensions.gen_random_uuid(),
  category text not null check(category in ('fun','romantic','deep','custom','intimate')),
  prompt text not null check(char_length(prompt) between 1 and 500),
  couple_id uuid references public.couples(id) on delete cascade,
  active boolean not null default true
);
create table if not exists public.couple_daily_questions (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  local_day date not null,
  question_id uuid references public.question_bank(id) on delete set null,
  prompt text not null,
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closes_at timestamptz not null,
  revealed_at timestamptz,
  unique(couple_id,local_day)
);
create table if not exists public.question_answers (
  question_id uuid not null references public.couple_daily_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer text not null check(char_length(answer) between 1 and 2000),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key(question_id,user_id)
);
alter table public.question_bank enable row level security;
create table if not exists public.question_skips (
  question_id uuid not null references public.couple_daily_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(question_id,user_id)
);
alter table public.question_skips enable row level security;
revoke all on public.question_skips from anon,authenticated;
grant select on public.question_skips to authenticated;
drop policy if exists question_skips_read on public.question_skips;
create policy question_skips_read on public.question_skips for select to authenticated
  using(user_id=auth.uid() and exists(select 1 from public.couple_daily_questions q where q.id=question_skips.question_id));
alter table public.couple_daily_questions enable row level security;
alter table public.question_answers enable row level security;
revoke all on public.question_bank,public.couple_daily_questions,public.question_answers from anon,authenticated;
grant select on public.couple_daily_questions,public.question_answers to authenticated;
drop policy if exists daily_questions_read on public.couple_daily_questions;
create policy daily_questions_read on public.couple_daily_questions for select to authenticated
  using(couple_id=public.current_couple_id() and public.is_complete_couple(couple_id));
drop policy if exists question_answers_read on public.question_answers;
create policy question_answers_read on public.question_answers for select to authenticated
  using(exists(select 1 from public.couple_daily_questions q where q.id=question_answers.question_id
    and (question_answers.user_id=auth.uid() or q.revealed_at is not null)));

insert into public.question_bank(id,category,prompt) values
  ('a1150000-0000-4000-8000-000000000001','fun','Si pudiéramos inventar una tradición absurda para nosotros, ¿cuál sería?'),
  ('a1150000-0000-4000-8000-000000000002','fun','¿Qué aventura pequeña te gustaría vivir conmigo este mes?'),
  ('a1150000-0000-4000-8000-000000000003','romantic','¿Qué detalle cotidiano te hace sentir cerca de mí?'),
  ('a1150000-0000-4000-8000-000000000004','romantic','¿Qué momento nuestro te gustaría volver a vivir?'),
  ('a1150000-0000-4000-8000-000000000005','deep','¿En qué te gustaría sentir más apoyo esta semana?'),
  ('a1150000-0000-4000-8000-000000000006','deep','¿Qué has aprendido sobre ti últimamente?')
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
  -- Intimate questions remain unavailable until mutual adult consent is implemented.
  if p_category is null or p_category not in ('fun','romantic','deep') then raise exception 'Categoría no disponible' using errcode='22023'; end if;
  select * into chosen from public.question_bank where active and category=p_category and couple_id is null
    order by (select max(q.local_day) from public.couple_daily_questions q where q.couple_id=c and q.question_id=question_bank.id) asc nulls first,id limit 1;
  if chosen.id is null then raise exception 'No hay preguntas en esta categoría' using errcode='22023'; end if;
  insert into public.couple_daily_questions(couple_id,local_day,question_id,prompt,category,closes_at)
    values(c,day,chosen.id,chosen.prompt,chosen.category,(day+1)::timestamp at time zone 'Europe/Madrid') returning * into result;
  return result;
end $$;
revoke all on function public.get_daily_question(text) from public;
grant execute on function public.get_daily_question(text) to authenticated;

create or replace function public.answer_daily_question(p_question_id uuid,p_answer text,p_expected_version integer)
returns void language plpgsql security definer set search_path=public as $$
declare q public.couple_daily_questions; previous public.question_answers;
begin
  select * into q from public.couple_daily_questions where id=p_question_id and couple_id=public.current_couple_id() for update;
  if auth.uid() is null or q.id is null or not public.is_complete_couple(q.couple_id) then raise exception 'Pregunta no disponible' using errcode='42501'; end if;
  if p_answer is null or char_length(trim(p_answer)) not between 1 and 2000 or p_expected_version is null then raise exception 'Respuesta no válida' using errcode='22023'; end if;
  select * into previous from public.question_answers where question_id=q.id and user_id=auth.uid();
  if previous.answer=trim(p_answer) then return; end if;
  if q.revealed_at is not null then raise exception 'Las respuestas ya están reveladas' using errcode='22023'; end if;
  if q.closes_at<=now() then raise exception 'La pregunta ha terminado' using errcode='22023'; end if;
  if exists(select 1 from public.question_skips where question_id=q.id and user_id=auth.uid()) then
    raise exception 'Has pasado esta pregunta. Retómala antes de responder' using errcode='22023';
  end if;
  if coalesce(previous.version,0)<>p_expected_version then raise exception 'La respuesta cambió. Actualiza antes de editar' using errcode='40001'; end if;
  insert into public.question_answers(question_id,user_id,answer) values(q.id,auth.uid(),trim(p_answer))
    on conflict(question_id,user_id) do update set answer=excluded.answer,version=question_answers.version+1,updated_at=now();
  update public.couple_daily_questions set updated_at=now() where id=q.id;
  if (select count(*) from public.question_answers where question_id=q.id)=2 then
    update public.couple_daily_questions set revealed_at=now() where id=q.id;
    insert into public.messages(couple_id,sender_id,type,text,metadata)
      values(q.couple_id,auth.uid(),'event','Habéis respondido a la pregunta del día',jsonb_build_object('kind','question','questionId',q.id));
    insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data,expires_at)
      select user_id,q.couple_id,'question:'||q.id||':'||user_id,'Vuestras respuestas están listas','Ya podéis descubrir las dos respuestas','status',
        jsonb_build_object('screen','Preguntas','questionId',q.id),q.closes_at
      from public.couple_members where couple_id=q.couple_id on conflict do nothing;
  end if;
end $$;
revoke all on function public.answer_daily_question(uuid,text,integer) from public;
grant execute on function public.answer_daily_question(uuid,text,integer) to authenticated;

create or replace function public.skip_daily_question(p_question_id uuid,p_skip boolean)
returns void language plpgsql security definer set search_path=public as $$
declare q public.couple_daily_questions;
begin
  select * into q from public.couple_daily_questions where id=p_question_id and couple_id=public.current_couple_id() for update;
  if auth.uid() is null or q.id is null or not public.is_complete_couple(q.couple_id) then raise exception 'Pregunta no disponible' using errcode='42501'; end if;
  if p_skip is null then raise exception 'Opción no válida' using errcode='22023'; end if;
  if q.revealed_at is not null or q.closes_at<=now() then raise exception 'La pregunta ha terminado' using errcode='22023'; end if;
  if p_skip then
    delete from public.question_answers where question_id=q.id and user_id=auth.uid();
    insert into public.question_skips values(q.id,auth.uid()) on conflict do nothing;
  else
    delete from public.question_skips where question_id=q.id and user_id=auth.uid();
  end if;
  update public.couple_daily_questions set updated_at=now() where id=q.id;
end $$;
revoke all on function public.skip_daily_question(uuid,boolean) from public;
grant execute on function public.skip_daily_question(uuid,boolean) to authenticated;

-- Answers are fetched under RLS after the question changes; do not broadcast their text.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='couple_daily_questions') then
    alter publication supabase_realtime add table public.couple_daily_questions;
  end if;
end $$;
commit;
