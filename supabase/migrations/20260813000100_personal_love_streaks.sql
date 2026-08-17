-- Actualización no destructiva para instalaciones creadas con el contador compartido.
-- El valor compartido existente se conserva como punto de partida para cada miembro.
begin;

alter table public.couple_members
  add column if not exists love_streak_count integer not null default 0
    check (love_streak_count >= 0),
  add column if not exists last_love_date date;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'couples'
      and column_name = 'streak_count'
  ) then
    execute $migration$
      update public.couple_members member
      set love_streak_count = couple.streak_count,
          last_love_date = couple.last_completed_date
      from public.couples couple
      where couple.id = member.couple_id
        and member.love_streak_count = 0
        and member.last_love_date is null
    $migration$;
  end if;
end;
$$;

create or replace function public.get_my_couple()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', couple.id,
    'inviteCode', couple.invite_code,
    'startDate', couple.start_date,
    'members', (
      select jsonb_agg(member.user_id order by member.joined_at)
      from public.couple_members member
      where member.couple_id = couple.id
    ),
    'streaks', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'userId', member.user_id,
            'count', member.love_streak_count,
            'lastConfirmedDay', member.last_love_date
          )
          order by member.joined_at
        ),
        '[]'::jsonb
      )
      from public.couple_members member
      where member.couple_id = couple.id
    )
  )
  from public.couples couple
  join public.couple_members mine on mine.couple_id = couple.id
  where mine.user_id = auth.uid();
$$;

create or replace function public.send_love(p_couple_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_streak_count integer;
  v_last_love_date date;
  v_event_id uuid;
begin
  if not public.is_complete_couple(p_couple_id) then
    raise exception 'La pareja no está completa o no te pertenece' using errcode = '42501';
  end if;

  select love_streak_count, last_love_date
  into v_streak_count, v_last_love_date
  from public.couple_members
  where couple_id = p_couple_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'No perteneces a esta pareja' using errcode = '42501';
  end if;

  insert into public.love_events (couple_id, user_id, sent_on)
  values (p_couple_id, auth.uid(), v_today)
  on conflict (couple_id, user_id, sent_on) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    v_streak_count := case
      when v_last_love_date = v_today - 1 then v_streak_count + 1
      else 1
    end;

    update public.couple_members
    set love_streak_count = v_streak_count,
        last_love_date = v_today
    where couple_id = p_couple_id
      and user_id = auth.uid();

    insert into public.messages (couple_id, sender_id, type, text)
    values (p_couple_id, auth.uid(), 'love', '❤️');
  end if;

  return jsonb_build_object(
    'streakCount', v_streak_count,
    'sentNow', v_event_id is not null,
    'sentToday', v_last_love_date = v_today or v_event_id is not null
  );
end;
$$;

create or replace function public.reset_broken_streaks()
returns void
language sql
security definer
set search_path = public
as $$
  update public.couple_members
  set love_streak_count = 0
  where love_streak_count > 0
    and (
      last_love_date is null
      or last_love_date < ((now() at time zone 'Europe/Madrid')::date - 1)
    );
$$;

-- Las funciones anteriores ya no dependen de las columnas compartidas, por lo que
-- ahora pueden retirarse sin romper dependencias almacenadas por PostgreSQL.
alter table public.couples
  drop column if exists streak_count,
  drop column if exists last_completed_date;

revoke all on function public.get_my_couple() from public;
revoke all on function public.send_love(uuid) from public;
revoke all on function public.reset_broken_streaks() from public;
grant execute on function public.get_my_couple() to authenticated;
grant execute on function public.send_love(uuid) to authenticated;
grant execute on function public.reset_broken_streaks() to service_role;

notify pgrst, 'reload schema';
commit;
