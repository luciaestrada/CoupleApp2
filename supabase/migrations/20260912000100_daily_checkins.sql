begin;
create table if not exists public.daily_checkins (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_day date not null,
  mood text not null check(mood in ('happy','calm','tired','sad','stressed','excited')),
  energy integer not null check(energy between 1 and 5),
  phrase text not null default '' check(char_length(phrase)<=280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(couple_id,user_id,local_day)
);
create table if not exists public.checkin_responses (
  checkin_id uuid not null references public.daily_checkins(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check(char_length(text) between 1 and 280),
  created_at timestamptz not null default now(),
  primary key(checkin_id,user_id)
);
alter table public.daily_checkins enable row level security;
alter table public.checkin_responses enable row level security;
revoke all on public.daily_checkins,public.checkin_responses from anon,authenticated;
grant select on public.daily_checkins,public.checkin_responses to authenticated;
drop policy if exists checkins_read on public.daily_checkins;
create policy checkins_read on public.daily_checkins for select to authenticated
  using(couple_id=public.current_couple_id() and public.is_complete_couple(couple_id) and expires_at>now());
drop policy if exists checkin_responses_read on public.checkin_responses;
create policy checkin_responses_read on public.checkin_responses for select to authenticated
  using(exists(select 1 from public.daily_checkins where id=checkin_id));

create or replace function public.save_daily_checkin(p_mood text,p_energy integer,p_phrase text)
returns public.daily_checkins language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id(); day date:=(now() at time zone 'Europe/Madrid')::date; result public.daily_checkins;
begin
  if auth.uid() is null or c is null or not public.is_complete_couple(c) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  if p_mood is null or p_mood not in ('happy','calm','tired','sad','stressed','excited') or p_energy is null or p_energy not between 1 and 5
    or p_phrase is null or char_length(p_phrase)>280 then raise exception 'Check-in no válido' using errcode='22023'; end if;
  insert into public.daily_checkins(couple_id,user_id,local_day,mood,energy,phrase,expires_at)
    values(c,auth.uid(),day,p_mood,p_energy,trim(p_phrase),(day+1)::timestamp at time zone 'Europe/Madrid')
    on conflict(couple_id,user_id,local_day) do update set mood=excluded.mood,energy=excluded.energy,phrase=excluded.phrase,updated_at=now(),expires_at=excluded.expires_at
    returning * into result;
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data,expires_at)
    select user_id,c,'checkin:'||result.id,'¿Cómo está tu pareja?','Ha compartido cómo se siente hoy','status',jsonb_build_object('screen','Inicio'),result.expires_at
    from public.couple_members where couple_id=c and user_id<>auth.uid()
    on conflict do nothing;
  return result;
end $$;
revoke all on function public.save_daily_checkin(text,integer,text) from public;
grant execute on function public.save_daily_checkin(text,integer,text) to authenticated;

create or replace function public.respond_daily_checkin(p_checkin_id uuid,p_text text)
returns void language plpgsql security definer set search_path=public as $$
declare item public.daily_checkins;
begin
  select * into item from public.daily_checkins where id=p_checkin_id and couple_id=public.current_couple_id() and expires_at>now();
  if item.id is null or item.user_id=auth.uid() or not public.is_complete_couple(item.couple_id) then raise exception 'Check-in no disponible' using errcode='42501'; end if;
  if p_text is null or char_length(trim(p_text)) not between 1 and 280 then raise exception 'Respuesta no válida' using errcode='22023'; end if;
  insert into public.checkin_responses(checkin_id,user_id,text) values(item.id,auth.uid(),trim(p_text))
    on conflict(checkin_id,user_id) do update set text=excluded.text;
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data,expires_at)
    values(item.user_id,item.couple_id,'checkin-response:'||item.id||':'||auth.uid(),'Un gesto de apoyo','Tu pareja ha respondido a tu check-in','status',jsonb_build_object('screen','Inicio'),item.expires_at)
    on conflict do nothing;
end $$;
revoke all on function public.respond_daily_checkin(uuid,text) from public;
grant execute on function public.respond_daily_checkin(uuid,text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='daily_checkins') then
    alter publication supabase_realtime add table public.daily_checkins;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='checkin_responses') then
    alter publication supabase_realtime add table public.checkin_responses;
  end if;
end $$;
commit;
