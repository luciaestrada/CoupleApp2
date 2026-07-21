create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  avatar_url text,
  expo_push_token text,
  status_text text not null default '',
  status_emoji text not null default '😍',
  status_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8)),
  start_date date not null default current_date,
  streak_count integer not null default 0 check (streak_count >= 0),
  last_completed_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id),
  unique (user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'text' check (type in ('text', 'love')),
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_couple_created_idx on public.messages(couple_id, created_at desc);

create table if not exists public.love_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_on date not null,
  created_at timestamptz not null default now(),
  unique (couple_id, user_id, sent_on)
);
create index if not exists love_events_couple_day_idx on public.love_events(couple_id, sent_on);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists stories_couple_created_idx on public.stories(couple_id, created_at desc);

create table if not exists public.special_dates (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  date date not null,
  recurring boolean not null default true,
  notify_days_before integer not null default 3 check (notify_days_before between 0 and 365),
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  updated_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_meters integer not null default 150 check (radius_meters between 50 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.geofence_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  geofence_id uuid references public.geofences(id) on delete set null,
  event_type text not null check (event_type in ('enter', 'exit')),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dedupe_key text not null,
  title text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, dedupe_key)
);
create index if not exists notifications_pending_idx
  on public.notifications(status, created_at) where status = 'pending';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- The app may have registered users before this schema was installed. The trigger
-- only handles future sign-ups, so create the missing profiles for existing users.
insert into public.profiles (id, name)
select
  id,
  coalesce(raw_user_meta_data ->> 'name', '')
from auth.users
on conflict (id) do nothing;

create or replace function public.is_couple_member(p_couple_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.couple_members
    where couple_id = p_couple_id and user_id = p_user_id
  );
$$;

create or replace function public.shares_couple(p_other_user_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.couple_members mine
    join public.couple_members theirs on theirs.couple_id = mine.couple_id
    where mine.user_id = auth.uid() and theirs.user_id = p_other_user_id
  );
$$;

create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
strict
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.create_couple_with_invite(p_start_date date default current_date)
returns table(new_couple_id uuid, new_invite_code text)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_couple_id uuid;
  v_invite_code text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una pareja';
  end if;

  insert into public.couples (start_date, created_by)
  values (coalesce(p_start_date, current_date), auth.uid())
  returning id, invite_code into v_couple_id, v_invite_code;

  insert into public.couple_members (couple_id, user_id)
  values (v_couple_id, auth.uid());

  return query select v_couple_id, v_invite_code;
end;
$$;

create or replace function public.join_couple_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una pareja';
  end if;

  select id into v_couple_id
  from public.couples
  where invite_code = upper(trim(p_invite_code))
  for update;

  if v_couple_id is null then
    raise exception 'Código de invitación no válido';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_couple_id) >= 2 then
    raise exception 'Esta pareja ya tiene dos miembros';
  end if;

  insert into public.couple_members (couple_id, user_id)
  values (v_couple_id, auth.uid());
  return v_couple_id;
end;
$$;

create or replace function public.send_love(p_couple_id uuid)
returns table(new_streak_count integer, was_sent_today boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_streak_count integer;
  v_last_completed date;
  v_inserted_id uuid;
  v_senders integer;
begin
  if not public.is_couple_member(p_couple_id) then
    raise exception 'No perteneces a esta pareja';
  end if;

  select streak_count, last_completed_date
  into v_streak_count, v_last_completed
  from public.couples
  where id = p_couple_id
  for update;

  insert into public.love_events (couple_id, user_id, sent_on)
  values (p_couple_id, auth.uid(), v_today)
  on conflict (couple_id, user_id, sent_on) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    insert into public.messages (couple_id, sender_id, type, text)
    values (p_couple_id, auth.uid(), 'love', '❤️');
  end if;

  select count(distinct user_id) into v_senders
  from public.love_events
  where couple_id = p_couple_id and sent_on = v_today;

  if v_senders >= 2 and v_last_completed is distinct from v_today then
    v_streak_count := case when v_last_completed = v_today - 1 then v_streak_count + 1 else 1 end;
    update public.couples
    set streak_count = v_streak_count, last_completed_date = v_today
    where id = p_couple_id;
  end if;

  return query select v_streak_count, true;
end;
$$;

create or replace function public.reset_broken_streaks()
returns void
language sql
security definer set search_path = public
as $$
  update public.couples
  set streak_count = 0
  where streak_count > 0
    and last_completed_date < ((now() at time zone 'Europe/Madrid')::date - 1);
$$;

create or replace function public.queue_geofence_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_other_user_id uuid;
  v_place_name text;
begin
  if new.event_type <> 'enter' then
    return new;
  end if;

  select user_id into v_other_user_id
  from public.couple_members
  where couple_id = new.couple_id and user_id <> new.user_id
  limit 1;

  select name into v_place_name from public.geofences where id = new.geofence_id;

  if v_other_user_id is not null then
    insert into public.notifications (user_id, dedupe_key, title, body)
    values (
      v_other_user_id,
      'geofence:' || new.id::text,
      'Tu pareja ha llegado',
      'Ha llegado a: ' || coalesce(v_place_name, 'un lugar guardado')
    )
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_geofence_event_created on public.geofence_events;
create trigger on_geofence_event_created
  after insert on public.geofence_events
  for each row execute procedure public.queue_geofence_notification();

create or replace function public.queue_special_date_notifications()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_special record;
  v_member record;
  v_target date;
  v_days integer;
  v_created integer := 0;
begin
  if extract(hour from (now() at time zone 'Europe/Madrid'))::integer <> 9 then
    return 0;
  end if;

  for v_special in select * from public.special_dates loop
    if v_special.recurring then
      v_target := (
        v_special.date
        + make_interval(
            years => extract(year from v_today)::integer - extract(year from v_special.date)::integer
          )
      )::date;
    else
      v_target := v_special.date;
    end if;

    v_days := v_target - v_today;
    if v_days in (0, v_special.notify_days_before) then
      for v_member in
        select user_id from public.couple_members where couple_id = v_special.couple_id
      loop
        insert into public.notifications (user_id, dedupe_key, title, body)
        values (
          v_member.user_id,
          'special-date:' || v_special.id::text || ':' || v_today::text || ':' || v_days::text,
          case when v_days = 0 then '¡Es hoy! 🎉' else 'Fecha especial próxima' end,
          case when v_days = 0 then v_special.title else v_special.title || ' en ' || v_days || ' días' end
        )
        on conflict (user_id, dedupe_key) do nothing;
        if found then v_created := v_created + 1; end if;
      end loop;
    end if;
  end loop;
  return v_created;
end;
$$;

revoke all on function public.create_couple_with_invite(date) from public;
revoke all on function public.join_couple_by_code(text) from public;
revoke all on function public.send_love(uuid) from public;
revoke all on function public.is_couple_member(uuid, uuid) from public;
revoke all on function public.shares_couple(uuid) from public;
revoke all on function public.try_uuid(text) from public;
revoke all on function public.reset_broken_streaks() from public;
revoke all on function public.queue_special_date_notifications() from public;
revoke all on function public.queue_geofence_notification() from public;
grant execute on function public.create_couple_with_invite(date) to authenticated;
grant execute on function public.join_couple_by_code(text) to authenticated;
grant execute on function public.send_love(uuid) to authenticated;
grant execute on function public.is_couple_member(uuid, uuid) to authenticated;
grant execute on function public.shares_couple(uuid) to authenticated;
grant execute on function public.try_uuid(text) to authenticated;
grant execute on function public.reset_broken_streaks() to service_role;
grant execute on function public.queue_special_date_notifications() to service_role;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.couples,
  public.couple_members,
  public.messages,
  public.love_events,
  public.stories,
  public.special_dates,
  public.locations,
  public.geofences,
  public.geofence_events,
  public.notifications
to authenticated;

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.messages enable row level security;
alter table public.love_events enable row level security;
alter table public.stories enable row level security;
alter table public.special_dates enable row level security;
alter table public.locations enable row level security;
alter table public.geofences enable row level security;
alter table public.geofence_events enable row level security;
alter table public.notifications enable row level security;

create policy "profiles_select_related" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_couple(id));
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "couples_select_member" on public.couples for select to authenticated
  using (public.is_couple_member(id));
create policy "couple_members_select_member" on public.couple_members for select to authenticated
  using (public.is_couple_member(couple_id));

create policy "messages_select_member" on public.messages for select to authenticated
  using (public.is_couple_member(couple_id));
create policy "messages_insert_member" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_couple_member(couple_id));

create policy "love_events_select_member" on public.love_events for select to authenticated
  using (public.is_couple_member(couple_id));

create policy "stories_select_member" on public.stories for select to authenticated
  using (public.is_couple_member(couple_id));
create policy "stories_insert_member" on public.stories for insert to authenticated
  with check (author_id = auth.uid() and public.is_couple_member(couple_id));
create policy "stories_delete_own" on public.stories for delete to authenticated
  using (author_id = auth.uid() and public.is_couple_member(couple_id));

create policy "special_dates_select_member" on public.special_dates for select to authenticated
  using (public.is_couple_member(couple_id));
create policy "special_dates_insert_member" on public.special_dates for insert to authenticated
  with check (created_by = auth.uid() and public.is_couple_member(couple_id));
create policy "special_dates_update_member" on public.special_dates for update to authenticated
  using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy "special_dates_delete_member" on public.special_dates for delete to authenticated
  using (public.is_couple_member(couple_id));

create policy "locations_select_member" on public.locations for select to authenticated
  using (public.is_couple_member(couple_id));
create policy "locations_insert_own" on public.locations for insert to authenticated
  with check (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "locations_update_own" on public.locations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_couple_member(couple_id));

create policy "geofences_select_member" on public.geofences for select to authenticated
  using (public.is_couple_member(couple_id));
create policy "geofences_insert_own" on public.geofences for insert to authenticated
  with check (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "geofences_update_own" on public.geofences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "geofences_delete_own" on public.geofences for delete to authenticated
  using (user_id = auth.uid());

create policy "geofence_events_select_member" on public.geofence_events for select to authenticated
  using (public.is_couple_member(couple_id));
create policy "geofence_events_insert_own" on public.geofence_events for insert to authenticated
  with check (user_id = auth.uid() and public.is_couple_member(couple_id));

create policy "notifications_select_own" on public.notifications for select to authenticated
  using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "story_files_select_member" on storage.objects for select to authenticated
  using (
    bucket_id = 'stories'
    and public.is_couple_member(public.try_uuid((storage.foldername(name))[1]))
  );
create policy "story_files_insert_member" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'stories'
    and public.is_couple_member(public.try_uuid((storage.foldername(name))[1]))
    and public.try_uuid((storage.foldername(name))[2]) = auth.uid()
  );
create policy "story_files_delete_own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'stories'
    and public.try_uuid((storage.foldername(name))[2]) = auth.uid()
  );

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'couples', 'couple_members', 'messages', 'love_events',
    'stories', 'special_dates', 'locations', 'geofences', 'geofence_events', 'notifications'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

-- Make newly created tables and RPCs available through PostgREST immediately.
notify pgrst, 'reload schema';
