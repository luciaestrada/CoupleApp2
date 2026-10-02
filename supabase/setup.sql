-- COUPLEAPP: REINICIO DESTRUCTIVO E INSTALACION COMPLETA
--
-- Ejecuta este archivo completo en el SQL Editor de Supabase. Es la única fuente
-- de verdad del backend. Recrea exclusivamente los objetos de CoupleApp y conserva
-- auth.users. Las cuentas existentes recuperan su perfil automáticamente, pero se
-- eliminan parejas, mensajes, historias, fechas, ubicaciones y notificaciones.
-- Incluye tablas, indices, RLS, RPC, Realtime, buckets privados y cron.
-- Ejecutar TODO el archivo con el rol administrador postgres, sin aplicar despues
-- las migraciones: ya estan incorporadas. El bloque BEGIN/COMMIT es atomico.
--
-- ALCANCE: conserva cuentas/passwords de Auth y archivos fisicos de Storage.
-- Para eliminar fotos antiguas, vaciar stories y avatars usando la API o el panel
-- de Storage ANTES del reinicio. No borrar storage.objects mediante SQL: eso no
-- elimina los archivos del almacenamiento y puede dejar objetos huerfanos.
--
-- FUERA DE SQL: desplegar las Edge Functions push y maintenance; configurar
-- FCM/APNs y Maps. Para activar llamadas desde cron, habilitar pg_net y Vault,
-- y guardar coupleapp_functions_url y coupleapp_scheduler_key en Vault.
-- Si ya existen esos secretos se conservan. Sin ellos los workers no se invocan.
-- Instrucciones completas: docs/IMPLEMENTACION_ESTADO.md.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

begin;

drop policy if exists avatar_read on storage.objects;
drop policy if exists avatar_write on storage.objects;
drop policy if exists avatar_delete on storage.objects;
drop table if exists public.live_location_requests cascade;
drop table if exists public.map_view_sessions cascade;
drop table if exists public.trips cascade;
drop table if exists public.activity_states cascade;
drop table if exists public.notification_deliveries cascade;
drop table if exists public.devices cascade;
drop table if exists public.user_settings cascade;
drop table if exists public.account_deletion_requests cascade;

-- Retira cualquier programación anterior antes de recrear las funciones.
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'coupleapp-reset-streaks',
      'coupleapp-special-date-reminders',
      'coupleapp-clean-location-history',
      'coupleapp-push-worker',
      'coupleapp-maintenance-worker',
      'coupleapp-clean-notifications'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

-- Elimina las políticas de Storage porque dependen de funciones de CoupleApp.
drop policy if exists story_files_select_member on storage.objects;
drop policy if exists story_files_insert_member on storage.objects;
drop policy if exists story_files_delete_own on storage.objects;

drop trigger if exists on_auth_user_created on auth.users;

-- Modelo anterior de Firebase/Supabase y modelo canónico. El orden no importa con cascade.
drop table if exists public.notifications cascade;
drop table if exists public.push_tokens cascade;
drop table if exists public.geofence_events cascade;
drop table if exists public.geofences cascade;
drop table if exists public.location_history cascade;
drop table if exists public.locations cascade;
drop table if exists public.special_dates cascade;
drop table if exists public.special_days cascade;
drop table if exists public.stories cascade;
drop table if exists public.love_events cascade;
drop table if exists public.messages cascade;
drop table if exists public.statuses cascade;
drop table if exists public.invites cascade;
drop table if exists public.couple_members cascade;
drop table if exists public.users cascade;
drop table if exists public.profiles cascade;
drop table if exists public.couples cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.get_my_couple() cascade;
drop function if exists public.create_couple(date) cascade;
drop function if exists public.create_couple_with_invite(date) cascade;
drop function if exists public.join_couple(text) cascade;
drop function if exists public.join_couple_by_code(text) cascade;
drop function if exists public.cancel_pending_couple() cascade;
drop function if exists public.send_message(uuid, text) cascade;
drop function if exists public.send_love(uuid) cascade;
drop function if exists public.set_status(text, text) cascade;
drop function if exists public.set_push_token(text) cascade;
drop function if exists public.publish_location(double precision, double precision) cascade;
drop function if exists public.create_story(text) cascade;
drop function if exists public.create_special_date(text, date, boolean, integer) cascade;
drop function if exists public.delete_special_date(uuid) cascade;
drop function if exists public.create_geofence(text, double precision, double precision, integer) cascade;
drop function if exists public.delete_geofence(uuid) cascade;
drop function if exists public.record_geofence_entry(uuid) cascade;
drop function if exists public.current_couple_id() cascade;
drop function if exists public.is_couple_member(uuid) cascade;
drop function if exists public.is_couple_member(uuid, uuid) cascade;
drop function if exists public.is_complete_couple(uuid) cascade;
drop function if exists public.shares_couple(uuid) cascade;
drop function if exists public.try_uuid(text) cascade;
drop function if exists public.reset_broken_streaks() cascade;
drop function if exists public.cleanup_location_history() cascade;
drop function if exists public.queue_geofence_notification() cascade;
drop function if exists public.queue_special_date_notifications() cascade;
drop function if exists public.claim_pending_notifications(integer) cascade;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  avatar_url text,
  status_text text not null default '' check (char_length(status_text) <= 60),
  status_emoji text not null default '' check (char_length(status_emoji) <= 16),
  status_updated_at timestamptz,
  created_at timestamptz not null default now()
);

-- Los tokens son credenciales de entrega y no forman parte del perfil consultable.
create table public.push_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  updated_at timestamptz not null default now()
);

create table public.couples (
  id uuid primary key default extensions.gen_random_uuid(),
  invite_code text unique check (invite_code is null or invite_code ~ '^[A-F0-9]{8}$'),
  start_date date not null check (
    start_date <= (now() at time zone 'Europe/Madrid')::date
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  love_streak_count integer not null default 0 check (love_streak_count >= 0),
  last_love_date date,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id),
  unique (user_id)
);
create index couple_members_couple_joined_idx
  on public.couple_members(couple_id, joined_at);

create table public.messages (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('text', 'love')),
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_couple_created_idx
  on public.messages(couple_id, created_at desc);

create table public.love_events (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_on date not null,
  created_at timestamptz not null default now(),
  unique (couple_id, user_id, sent_on)
);
create index love_events_couple_day_idx
  on public.love_events(couple_id, sent_on);

create table public.stories (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (expires_at > created_at)
);
create index stories_couple_created_idx
  on public.stories(couple_id, created_at desc);
create index stories_expiration_idx
  on public.stories(expires_at);
alter table public.stories replica identity full;

create table public.special_dates (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  date date not null,
  recurring boolean not null,
  notify_days_before integer not null check (notify_days_before between 0 and 365),
  created_at timestamptz not null default now()
);
create index special_dates_couple_date_idx
  on public.special_dates(couple_id, date);

create table public.locations (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  updated_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table public.location_history (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  recorded_at timestamptz not null default now()
);
create index location_history_couple_user_recorded_idx
  on public.location_history(couple_id, user_id, recorded_at desc);

create table public.geofences (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_meters integer not null check (radius_meters between 50 and 1000),
  created_at timestamptz not null default now()
);
create index geofences_user_idx on public.geofences(couple_id, user_id);

create table public.geofence_events (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  geofence_id uuid not null references public.geofences(id) on delete cascade,
  event_type text not null check (event_type = 'enter'),
  created_at timestamptz not null default now()
);
create index geofence_events_couple_created_idx
  on public.geofence_events(couple_id, created_at desc);
create index geofence_events_place_created_idx
  on public.geofence_events(geofence_id, user_id, created_at desc);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dedupe_key text not null,
  title text not null,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((status = 'processing') = (claimed_at is not null)),
  unique (user_id, dedupe_key)
);
create index notifications_dispatch_idx
  on public.notifications(status, claimed_at, created_at)
  where attempt_count < 5;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := trim(coalesce(new.raw_user_meta_data ->> 'name', ''));
  if v_name = '' then
    v_name := coalesce(
      nullif(split_part(new.email, '@', 1), ''),
      'Usuario ' || left(new.id::text, 8)
    );
  end if;

  insert into public.profiles (id, name)
  values (new.id, left(v_name, 80));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, name)
select
  id,
  left(
    case
      when trim(coalesce(raw_user_meta_data ->> 'name', '')) <> ''
        then trim(raw_user_meta_data ->> 'name')
      else coalesce(
        nullif(split_part(email, '@', 1), ''),
        'Usuario ' || left(id::text, 8)
      )
    end,
    80
  )
from auth.users;

create function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select couple_id
  from public.couple_members
  where user_id = auth.uid();
$$;

create function public.is_couple_member(p_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.couple_members
    where couple_id = p_couple_id
      and user_id = auth.uid()
  );
$$;

create function public.is_complete_couple(p_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_couple_member(p_couple_id)
    and (
      select count(*) = 2
      from public.couple_members
      where couple_id = p_couple_id
    );
$$;

create function public.shares_couple(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.couple_members mine
    join public.couple_members theirs on theirs.couple_id = mine.couple_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_other_user_id
  );
$$;

create function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create function public.get_my_couple()
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

create function public.create_couple(p_start_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_couple_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;
  if p_start_date is null
    or p_start_date > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'La fecha de inicio no es válida' using errcode = '22007';
  end if;
  if public.current_couple_id() is not null then
    raise exception 'Ya perteneces a una pareja' using errcode = '23505';
  end if;

  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));
    begin
      insert into public.couples (invite_code, start_date, created_by)
      values (v_code, p_start_date, auth.uid())
      returning id into v_couple_id;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  insert into public.couple_members (couple_id, user_id)
  values (v_couple_id, auth.uid());

  return public.get_my_couple();
end;
$$;

create function public.join_couple(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;
  if public.current_couple_id() is not null then
    raise exception 'Ya perteneces a una pareja' using errcode = '23505';
  end if;
  if upper(trim(p_invite_code)) !~ '^[A-F0-9]{8}$' then
    raise exception 'El código de invitación no es válido' using errcode = '22023';
  end if;

  select id
  into v_couple_id
  from public.couples
  where invite_code = upper(trim(p_invite_code))
  for update;

  if v_couple_id is null then
    raise exception 'El código de invitación no existe o ya fue utilizado' using errcode = 'P0002';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_couple_id) <> 1 then
    raise exception 'La invitación no está disponible' using errcode = '23514';
  end if;

  insert into public.couple_members (couple_id, user_id)
  values (v_couple_id, auth.uid());

  update public.couples
  set invite_code = null
  where id = v_couple_id;

  return public.get_my_couple();
end;
$$;

create function public.cancel_pending_couple()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
begin
  if v_couple_id is null then
    raise exception 'No perteneces a una pareja' using errcode = 'P0002';
  end if;
  select id
  into v_couple_id
  from public.couples
  where id = v_couple_id
    and created_by = auth.uid()
    and invite_code is not null
  for update;

  if v_couple_id is null
    or (select count(*) from public.couple_members where couple_id = v_couple_id) <> 1 then
    raise exception 'Solo puedes cancelar una invitación pendiente creada por ti'
      using errcode = '42501';
  end if;

  delete from public.couples where id = v_couple_id;
end;
$$;

create function public.send_message(p_couple_id uuid, p_text text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_message_id uuid;
  v_text text := trim(p_text);
begin
  if not public.is_complete_couple(p_couple_id) then
    raise exception 'La pareja no está completa o no te pertenece' using errcode = '42501';
  end if;
  if char_length(v_text) not between 1 and 2000 then
    raise exception 'El mensaje debe tener entre 1 y 2000 caracteres' using errcode = '22023';
  end if;

  insert into public.messages (couple_id, sender_id, type, text)
  values (p_couple_id, auth.uid(), 'text', v_text)
  returning id into v_message_id;
  return v_message_id;
end;
$$;

create function public.send_love(p_couple_id uuid)
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

create function public.set_status(p_text text, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := trim(p_text);
  v_emoji text := trim(p_emoji);
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;
  if char_length(v_text) > 60 or char_length(v_emoji) > 16 then
    raise exception 'El estado supera la longitud permitida' using errcode = '22023';
  end if;
  update public.profiles
  set status_text = v_text,
      status_emoji = v_emoji,
      status_updated_at = case when v_text = '' and v_emoji = '' then null else now() end
  where id = auth.uid();
end;
$$;

create function public.set_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;
  if p_token is not null and p_token !~ '^Expo(nent)?PushToken\[[^]]+\]$' then
    raise exception 'El token de notificaciones no es válido' using errcode = '22023';
  end if;

  if p_token is not null then
    -- Un token identifica un dispositivo/proyecto. Transferirlo impide que una cuenta
    -- anterior siga recibiendo notificaciones cuando el dispositivo cambia de usuario.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_token, 0));
    delete from public.push_tokens
    where expo_push_token = p_token
      and user_id <> auth.uid();

    insert into public.push_tokens (user_id, expo_push_token, updated_at)
    values (auth.uid(), p_token, now())
    on conflict (user_id) do update
    set expo_push_token = excluded.expo_push_token,
        updated_at = excluded.updated_at;
  else
    delete from public.push_tokens
    where user_id = auth.uid();
  end if;
end;
$$;

create function public.publish_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
begin
  if v_couple_id is null or not public.is_complete_couple(v_couple_id) then
    raise exception 'La pareja no está completa o no te pertenece' using errcode = '42501';
  end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Las coordenadas no son válidas' using errcode = '22023';
  end if;

  insert into public.locations (couple_id, user_id, lat, lng, updated_at)
  values (v_couple_id, auth.uid(), p_lat, p_lng, now())
  on conflict (couple_id, user_id) do update
  set lat = excluded.lat,
      lng = excluded.lng,
      updated_at = excluded.updated_at;

  -- La posición actual se mantiene fresca, pero el recorrido se muestrea para
  -- limitar batería, tráfico y crecimiento de la tabla.
  insert into public.location_history (couple_id, user_id, lat, lng, recorded_at)
  select v_couple_id, auth.uid(), p_lat, p_lng, now()
  where not exists (
    select 1
    from public.location_history history
    where history.couple_id = v_couple_id
      and history.user_id = auth.uid()
      and history.recorded_at > now() - interval '15 minutes'
  );
end;
$$;

create function public.cleanup_location_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.location_history
  where recorded_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create function public.create_story(p_image_path text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_couple_id uuid := public.current_couple_id();
  v_story_id uuid;
begin
  if v_couple_id is null or not public.is_complete_couple(v_couple_id) then
    raise exception 'La pareja no está completa o no te pertenece' using errcode = '42501';
  end if;
  if split_part(p_image_path, '/', 1) <> v_couple_id::text
    or split_part(p_image_path, '/', 2) <> auth.uid()::text
    or p_image_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{13}\.(jpg|png|webp|heic|heif)$' then
    raise exception 'La ruta de la historia no es válida' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'stories'
      and name = p_image_path
  ) then
    raise exception 'El archivo de la historia no existe' using errcode = 'P0002';
  end if;

  insert into public.stories (couple_id, author_id, image_path)
  values (v_couple_id, auth.uid(), p_image_path)
  returning id into v_story_id;
  return v_story_id;
end;
$$;

create function public.create_special_date(
  p_title text,
  p_date date,
  p_recurring boolean,
  p_notify_days_before integer
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_couple_id uuid := public.current_couple_id();
  v_date_id uuid;
  v_title text := trim(p_title);
begin
  if v_couple_id is null or not public.is_complete_couple(v_couple_id) then
    raise exception 'La pareja no está completa o no te pertenece' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 100
    or p_date is null
    or p_recurring is null
    or p_notify_days_before not between 0 and 365 then
    raise exception 'Los datos de la fecha especial no son válidos' using errcode = '22023';
  end if;

  insert into public.special_dates (
    couple_id, created_by, title, date, recurring, notify_days_before
  )
  values (
    v_couple_id, auth.uid(), v_title, p_date, p_recurring, p_notify_days_before
  )
  returning id into v_date_id;
  return v_date_id;
end;
$$;

create function public.create_geofence(
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_radius_meters integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_couple_id uuid := public.current_couple_id();
  v_geofence public.geofences;
  v_name text := trim(p_name);
begin
  if v_couple_id is null or not public.is_complete_couple(v_couple_id) then
    raise exception 'La pareja no está completa o no te pertenece' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80
    or p_lat not between -90 and 90
    or p_lng not between -180 and 180
    or p_radius_meters not between 50 and 1000 then
    raise exception 'Los datos del lugar no son válidos' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text, 2)
  );
  if (
    select count(*)
    from public.geofences
    where user_id = auth.uid()
  ) >= 20 then
    raise exception 'Solo puedes guardar 20 lugares' using errcode = '23514';
  end if;

  insert into public.geofences (couple_id, user_id, name, lat, lng, radius_meters)
  values (v_couple_id, auth.uid(), v_name, p_lat, p_lng, p_radius_meters)
  returning * into v_geofence;
  return to_jsonb(v_geofence);
end;
$$;

create function public.delete_special_date(p_date_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
begin
  if v_couple_id is null or not public.is_complete_couple(v_couple_id) then
    raise exception 'La pareja no está completa o no te pertenece' using errcode = '42501';
  end if;

  delete from public.special_dates
  where id = p_date_id
    and couple_id = v_couple_id;
  if not found then
    raise exception 'La fecha especial no existe' using errcode = 'P0002';
  end if;
end;
$$;

create function public.delete_geofence(p_geofence_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
begin
  if v_couple_id is null or not public.is_complete_couple(v_couple_id) then
    raise exception 'La pareja no está completa o no te pertenece' using errcode = '42501';
  end if;

  delete from public.geofences
  where id = p_geofence_id
    and couple_id = v_couple_id
    and user_id = auth.uid();
  if not found then
    raise exception 'El lugar no existe o no te pertenece' using errcode = 'P0002';
  end if;
end;
$$;

create function public.record_geofence_entry(p_geofence_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_geofence public.geofences;
  v_event_id uuid;
begin
  select *
  into v_geofence
  from public.geofences
  where id = p_geofence_id
    and user_id = auth.uid();

  if v_geofence.id is null or not public.is_complete_couple(v_geofence.couple_id) then
    raise exception 'El lugar no pertenece al usuario autenticado' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_geofence.id::text, 3)
  );

  select event.id
  into v_event_id
  from public.geofence_events event
  where event.geofence_id = v_geofence.id
    and event.user_id = auth.uid()
    and event.created_at > now() - interval '15 minutes'
  order by event.created_at desc
  limit 1;

  if v_event_id is not null then
    return v_event_id;
  end if;

  insert into public.geofence_events (
    couple_id, user_id, geofence_id, event_type
  )
  values (
    v_geofence.couple_id, auth.uid(), v_geofence.id, 'enter'
  )
  returning id into v_event_id;
  return v_event_id;
end;
$$;

create function public.reset_broken_streaks()
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

create function public.queue_geofence_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_user_id uuid;
  v_place_name text;
begin
  select user_id
  into v_other_user_id
  from public.couple_members
  where couple_id = new.couple_id
    and user_id <> new.user_id;

  select name
  into v_place_name
  from public.geofences
  where id = new.geofence_id;

  if v_other_user_id is not null then
    insert into public.notifications (user_id, dedupe_key, title, body)
    values (
      v_other_user_id,
      'geofence:' || new.id::text,
      'Tu pareja ha llegado',
      'Ha llegado a: ' || v_place_name
    )
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_geofence_event_created
  after insert on public.geofence_events
  for each row execute function public.queue_geofence_notification();

create function public.queue_special_date_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_special record;
  v_member record;
  v_target date;
  v_year integer;
  v_last_day integer;
  v_days integer;
  v_created integer := 0;
begin
  if extract(hour from (now() at time zone 'Europe/Madrid'))::integer <> 9 then
    return 0;
  end if;

  for v_special in select * from public.special_dates loop
    if v_special.recurring then
      v_year := extract(year from v_today)::integer;
      v_last_day := extract(
        day from (make_date(v_year, extract(month from v_special.date)::integer, 1)
          + interval '1 month - 1 day')
      )::integer;
      v_target := make_date(
        v_year,
        extract(month from v_special.date)::integer,
        least(extract(day from v_special.date)::integer, v_last_day)
      );

      if v_target < v_today then
        v_year := v_year + 1;
        v_last_day := extract(
          day from (make_date(v_year, extract(month from v_special.date)::integer, 1)
            + interval '1 month - 1 day')
        )::integer;
        v_target := make_date(
          v_year,
          extract(month from v_special.date)::integer,
          least(extract(day from v_special.date)::integer, v_last_day)
        );
      end if;
    else
      v_target := v_special.date;
    end if;

    v_days := v_target - v_today;
    if v_days in (0, v_special.notify_days_before) then
      for v_member in
        select user_id
        from public.couple_members
        where couple_id = v_special.couple_id
      loop
        insert into public.notifications (user_id, dedupe_key, title, body)
        values (
          v_member.user_id,
          'special-date:' || v_special.id::text || ':' || v_target::text || ':' || v_days::text,
          case when v_days = 0 then '¡Es hoy! 🎉' else 'Fecha especial próxima' end,
          case when v_days = 0 then v_special.title else v_special.title || ' en ' || v_days || ' días' end
        )
        on conflict (user_id, dedupe_key) do nothing;
        if found then
          v_created := v_created + 1;
        end if;
      end loop;
    end if;
  end loop;
  return v_created;
end;
$$;

-- Reserva atómicamente un lote para impedir que dos ejecuciones de maintenance
-- envíen el mismo push. Los lotes abandonados vuelven a estar disponibles tras 10 minutos.
create function public.claim_pending_notifications(p_limit integer default 100)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'El tamaño del lote debe estar entre 1 y 100' using errcode = '22023';
  end if;

  update public.notifications notification
  set status = 'failed',
      claimed_at = null,
      last_error = coalesce(
        notification.last_error,
        'La entrega se interrumpió durante el último intento'
      )
  where notification.status = 'processing'
    and notification.attempt_count >= 5
    and notification.claimed_at <= now() - interval '10 minutes';

  return query
  with candidates as (
    select notification.id
    from public.notifications notification
    where notification.attempt_count < 5
      and (
        notification.status = 'pending'
        or (
          notification.status = 'processing'
          and notification.claimed_at <= now() - interval '10 minutes'
        )
      )
    order by notification.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.notifications notification
    set status = 'processing',
        claimed_at = now(),
        attempt_count = notification.attempt_count + 1
    from candidates
    where notification.id = candidates.id
    returning
      notification.id,
      notification.user_id,
      notification.title,
      notification.body,
      notification.attempt_count
  )
  select
    claimed.id,
    claimed.user_id,
    claimed.title,
    claimed.body,
    claimed.attempt_count
  from claimed;
end;
$$;

-- Permisos de tablas: el cliente solo consulta. Las escrituras pasan por RPCs.
grant usage on schema public to authenticated, service_role;
revoke all on table public.profiles,
  public.push_tokens,
  public.couples,
  public.couple_members,
  public.messages,
  public.love_events,
  public.stories,
  public.special_dates,
  public.locations,
  public.location_history,
  public.geofences,
  public.geofence_events,
  public.notifications
from anon, authenticated;
grant select on public.profiles,
  public.couples,
  public.couple_members,
  public.messages,
  public.love_events,
  public.stories,
  public.special_dates,
  public.locations,
  public.location_history,
  public.geofences,
  public.geofence_events,
  public.notifications
to authenticated;

grant all on table public.profiles,
  public.push_tokens,
  public.couples,
  public.couple_members,
  public.messages,
  public.love_events,
  public.stories,
  public.special_dates,
  public.locations,
  public.location_history,
  public.geofences,
  public.geofence_events,
  public.notifications
to service_role;

alter table public.profiles enable row level security;
alter table public.push_tokens enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.messages enable row level security;
alter table public.love_events enable row level security;
alter table public.stories enable row level security;
alter table public.special_dates enable row level security;
alter table public.locations enable row level security;
alter table public.location_history enable row level security;
alter table public.geofences enable row level security;
alter table public.geofence_events enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_related
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_couple(id));

create policy couples_select_member
  on public.couples for select to authenticated
  using (public.is_couple_member(id));

create policy couple_members_select_member
  on public.couple_members for select to authenticated
  using (public.is_couple_member(couple_id));

create policy messages_select_member
  on public.messages for select to authenticated
  using (public.is_couple_member(couple_id));

create policy love_events_select_member
  on public.love_events for select to authenticated
  using (public.is_couple_member(couple_id));

create policy stories_select_member
  on public.stories for select to authenticated
  using (public.is_couple_member(couple_id));

create policy special_dates_select_member
  on public.special_dates for select to authenticated
  using (public.is_couple_member(couple_id));

create policy locations_select_member
  on public.locations for select to authenticated
  using (public.is_couple_member(couple_id));

create policy location_history_select_member
  on public.location_history for select to authenticated
  using (public.is_couple_member(couple_id));

create policy geofences_select_member
  on public.geofences for select to authenticated
  using (public.is_couple_member(couple_id));

create policy geofence_events_select_member
  on public.geofence_events for select to authenticated
  using (public.is_couple_member(couple_id));

create policy notifications_select_own
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

revoke all on function public.handle_new_user() from public;
revoke all on function public.queue_geofence_notification() from public;
revoke all on function public.current_couple_id() from public;
revoke all on function public.is_couple_member(uuid) from public;
revoke all on function public.is_complete_couple(uuid) from public;
revoke all on function public.shares_couple(uuid) from public;
revoke all on function public.try_uuid(text) from public;
revoke all on function public.get_my_couple() from public;
revoke all on function public.create_couple(date) from public;
revoke all on function public.join_couple(text) from public;
revoke all on function public.cancel_pending_couple() from public;
revoke all on function public.send_message(uuid, text) from public;
revoke all on function public.send_love(uuid) from public;
revoke all on function public.set_status(text, text) from public;
revoke all on function public.set_push_token(text) from public;
revoke all on function public.publish_location(double precision, double precision) from public;
revoke all on function public.create_story(text) from public;
revoke all on function public.create_special_date(text, date, boolean, integer) from public;
revoke all on function public.delete_special_date(uuid) from public;
revoke all on function public.create_geofence(text, double precision, double precision, integer) from public;
revoke all on function public.delete_geofence(uuid) from public;
revoke all on function public.record_geofence_entry(uuid) from public;
revoke all on function public.reset_broken_streaks() from public;
revoke all on function public.cleanup_location_history() from public;
revoke all on function public.queue_special_date_notifications() from public;
revoke all on function public.claim_pending_notifications(integer) from public;

grant execute on function public.current_couple_id() to authenticated;
grant execute on function public.is_couple_member(uuid) to authenticated;
grant execute on function public.is_complete_couple(uuid) to authenticated;
grant execute on function public.shares_couple(uuid) to authenticated;
grant execute on function public.try_uuid(text) to authenticated;
grant execute on function public.get_my_couple() to authenticated;
grant execute on function public.create_couple(date) to authenticated;
grant execute on function public.join_couple(text) to authenticated;
grant execute on function public.cancel_pending_couple() to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.send_love(uuid) to authenticated;
grant execute on function public.set_status(text, text) to authenticated;
grant execute on function public.set_push_token(text) to authenticated;
grant execute on function public.publish_location(double precision, double precision) to authenticated;
grant execute on function public.create_story(text) to authenticated;
grant execute on function public.create_special_date(text, date, boolean, integer) to authenticated;
grant execute on function public.delete_special_date(uuid) to authenticated;
grant execute on function public.create_geofence(text, double precision, double precision, integer) to authenticated;
grant execute on function public.delete_geofence(uuid) to authenticated;
grant execute on function public.record_geofence_entry(uuid) to authenticated;
grant execute on function public.reset_broken_streaks() to service_role;
grant execute on function public.cleanup_location_history() to service_role;
grant execute on function public.queue_special_date_notifications() to service_role;
grant execute on function public.claim_pending_notifications(integer) to service_role;

-- Storage privado. La ruta obligatoria es couple_id/user_id/timestamp.extension.
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

create policy story_files_select_member
  on storage.objects for select to authenticated
  using (
    bucket_id = 'stories'
    and public.is_complete_couple(public.try_uuid((storage.foldername(name))[1]))
  );

create policy story_files_insert_member
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'stories'
    and public.is_complete_couple(public.try_uuid((storage.foldername(name))[1]))
    and public.try_uuid((storage.foldername(name))[2]) = auth.uid()
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{13}\.(jpg|png|webp|heic|heif)$'
  );

create policy story_files_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'stories'
    and public.try_uuid((storage.foldername(name))[2]) = auth.uid()
  );

-- Realtime solo para datos que la aplicación observa en vivo.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'couples', 'couple_members', 'messages', 'stories',
    'special_dates', 'locations', 'location_history', 'geofences'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

-- Horarios en UTC; las funciones aplican la zona Europe/Madrid cuando corresponde.
select cron.schedule(
  'coupleapp-reset-streaks',
  '5 3 * * *',
  'select public.reset_broken_streaks();'
);

select cron.schedule(
  'coupleapp-special-date-reminders',
  '0 * * * *',
  'select public.queue_special_date_notifications();'
);

select cron.schedule(
  'coupleapp-clean-location-history',
  '25 3 * * *',
  'select public.cleanup_location_history();'
);

-- Fuerza a PostgREST a descubrir tablas y RPCs al confirmar la transacción.
notify pgrst, 'reload schema';

-- BEGIN GENERATED 20260908000100
create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  location_mode text not null default 'off' check (location_mode in ('off','balanced','live')),
  live_until timestamptz,
  tracking_device_id uuid,
  history_enabled boolean not null default false,
  background_enabled boolean not null default false,
  notifications_enabled boolean not null default true,
  chat_enabled boolean not null default true,
  love_enabled boolean not null default true,
  geofence_enabled boolean not null default true,
  dates_enabled boolean not null default true,
  stories_enabled boolean not null default false,
  preview_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.user_settings(user_id) select id from public.profiles;

create table public.devices (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text unique,
  installation_hash text not null,
  platform text not null check (platform in ('android','ios')),
  updated_at timestamptz not null default now()
);
create index devices_user_idx on public.devices(user_id);

alter table public.locations add column captured_at timestamptz;
alter table public.locations add column accuracy_m double precision;
alter table public.locations add column speed_mps double precision;
alter table public.locations add column heading double precision;
alter table public.locations add column device_id uuid;
alter table public.locations add column sample_id uuid;
update public.locations set captured_at = updated_at;
alter table public.locations alter column captured_at set not null;
alter table public.locations add column sharing boolean not null default false;

alter table public.notifications add column push_enabled_at_creation boolean not null default true;
alter table public.notifications add column kind text not null default 'dates';
alter table public.notifications add column data jsonb not null default '{}';
alter table public.notifications add column read_at timestamptz;
alter table public.notifications add column expires_at timestamptz not null default (now() + interval '1 day');
alter table public.notifications add column couple_id uuid references public.couples(id) on delete cascade;
update public.notifications set kind = 'geofence' where dedupe_key like 'geofence:%';
-- Expire old work: the new pipeline must not replay historical alerts.
update public.notifications set expires_at = now();

create table public.notification_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  push_token text not null,
  status text not null default 'pending' check (status in ('pending','processing','accepted','delivered','failed','expired')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  claimed_at timestamptz,
  ticket_id text,
  receipt_checked_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique(notification_id, device_id)
);
create index notification_deliveries_queue_idx on public.notification_deliveries(status,next_attempt_at);

alter table public.messages add column client_id uuid;
create unique index messages_client_id_idx on public.messages(sender_id,client_id) where client_id is not null;

create or replace function public.save_settings(p_settings jsonb, p_device_id uuid)
returns public.user_settings language plpgsql security definer set search_path = public as $$
declare v public.user_settings; v_mode text;
begin
  if auth.uid() is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  insert into public.user_settings(user_id) values(auth.uid()) on conflict do nothing;
  select * into v from public.user_settings where user_id=auth.uid() for update;
  v_mode := coalesce(p_settings->>'location_mode',v.location_mode);
  if v_mode not in ('off','balanced','live') then raise exception 'Modo no válido'; end if;
  if p_settings ? 'location_mode' and v_mode <> 'off' then
    if not exists(select 1 from public.devices where id=p_device_id and user_id=auth.uid())
      or not public.is_complete_couple(public.current_couple_id()) then
      raise exception 'Dispositivo o pareja no disponibles' using errcode='42501';
    end if;
    v.tracking_device_id := p_device_id;
    v.live_until := case when v_mode='live' then now()+interval '15 minutes' else null end;
  end if;
  update public.user_settings set
    location_mode=v_mode,
    live_until=case when v_mode='off' then null else v.live_until end,
    tracking_device_id=case when v_mode='off' then null else v.tracking_device_id end,
    history_enabled=coalesce((p_settings->>'history_enabled')::boolean,v.history_enabled),
    background_enabled=coalesce((p_settings->>'background_enabled')::boolean,v.background_enabled),
    notifications_enabled=coalesce((p_settings->>'notifications_enabled')::boolean,v.notifications_enabled),
    chat_enabled=coalesce((p_settings->>'chat_enabled')::boolean,v.chat_enabled),
    love_enabled=coalesce((p_settings->>'love_enabled')::boolean,v.love_enabled),
    geofence_enabled=coalesce((p_settings->>'geofence_enabled')::boolean,v.geofence_enabled),
    dates_enabled=coalesce((p_settings->>'dates_enabled')::boolean,v.dates_enabled),
    stories_enabled=coalesce((p_settings->>'stories_enabled')::boolean,v.stories_enabled),
    preview_enabled=coalesce((p_settings->>'preview_enabled')::boolean,v.preview_enabled), updated_at=now()
  where user_id=auth.uid() returning * into v;
  if v_mode='off' then update public.locations set sharing=false,lat=0,lng=0,accuracy_m=null,speed_mps=null,heading=null,updated_at=now() where user_id=auth.uid(); end if;
  return v;
end $$;

create or replace function public.register_device(p_device_id uuid,p_token text,p_platform text,p_installation_secret text,p_expected_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_device_id is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  if p_installation_secret is null or length(p_installation_secret)<32 then raise exception 'Instalación no válida' using errcode='42501'; end if;
  if exists(select 1 from public.devices where id=p_device_id and installation_hash<>encode(sha256(convert_to(p_installation_secret,'UTF8')),'hex')) then raise exception 'Instalación no autorizada' using errcode='42501'; end if;
  if exists(select 1 from public.account_deletion_requests where user_id=auth.uid()) then raise exception 'Cuenta pendiente de eliminación' using errcode='42501'; end if;
  if p_token is not null and p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then raise exception 'Token no válido'; end if;
  -- Invalidate pending deliveries on account or token rotation.
  delete from public.notification_deliveries where device_id=p_device_id and
    (push_token is distinct from p_token or exists(select 1 from public.devices where id=p_device_id and user_id<>auth.uid()));
  update public.devices set expo_push_token=null where expo_push_token=p_token and id<>p_device_id;
  insert into public.devices(id,user_id,expo_push_token,platform,installation_hash) values(p_device_id,auth.uid(),p_token,p_platform,encode(sha256(convert_to(p_installation_secret,'UTF8')),'hex'))
  on conflict(id) do update set user_id=excluded.user_id,expo_push_token=excluded.expo_push_token,platform=excluded.platform,updated_at=now() where devices.installation_hash=excluded.installation_hash;
  if not found then raise exception 'Instalación no autorizada' using errcode='42501'; end if;
  insert into public.user_settings(user_id) values(auth.uid()) on conflict do nothing;
end $$;

create or replace function public.revoke_device(p_device_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.notification_deliveries where device_id=p_device_id and exists(select 1 from public.devices where id=p_device_id and user_id=auth.uid());
  update public.devices set expo_push_token=null,updated_at=now() where id=p_device_id and user_id=auth.uid();
  update public.user_settings set location_mode='off',live_until=null,tracking_device_id=null,updated_at=now()
    where user_id=auth.uid() and tracking_device_id=p_device_id;
  update public.locations set sharing=false,lat=0,lng=0,accuracy_m=null,speed_mps=null,heading=null,updated_at=now() where user_id=auth.uid() and device_id=p_device_id;
end $$;

create or replace function public.publish_location_sample(p_sample jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare v public.user_settings; c uuid; t timestamptz; lat double precision; lng double precision; accuracy double precision; device uuid;
begin
  c:=public.current_couple_id();
  select * into v from public.user_settings where user_id=auth.uid() for update;
  device:=(p_sample->>'device_id')::uuid;
  if (p_sample->>'user_id')::uuid is distinct from auth.uid() or v.user_id is null or v.location_mode='off' or (v.location_mode='live' and v.live_until<=now()) or v.tracking_device_id is distinct from device
    or not public.is_complete_couple(c) or not exists(select 1 from public.devices where id=device and user_id=auth.uid()) then
    raise exception 'Compartición desactivada o dispositivo no autorizado' using errcode='42501';
  end if;
  t:=(p_sample->>'captured_at')::timestamptz;
  lat:=(p_sample->>'lat')::double precision; lng:=(p_sample->>'lng')::double precision; accuracy:=(p_sample->>'accuracy_m')::double precision;
  if t is null or t>now()+interval '1 minute' or t<now()-interval '15 minutes'
    or lat is null or not(lat between -90 and 90) or lng is null or not(lng between -180 and 180)
    or accuracy is null or not(accuracy between 0 and 10000) or p_sample->>'sample_id' is null then raise exception 'Muestra no válida' using errcode='22023'; end if;
  if exists(select 1 from public.locations where user_id=auth.uid() and (captured_at>=t or updated_at>now()-interval '3 seconds')) then return false; end if;
  insert into public.locations(couple_id,user_id,lat,lng,updated_at,captured_at,accuracy_m,speed_mps,heading,device_id,sample_id,sharing)
  values(c,auth.uid(),lat,lng,now(),t,accuracy,
    case when (p_sample->>'speed_mps')::double precision between 0 and 100 then (p_sample->>'speed_mps')::double precision end,
    case when (p_sample->>'heading')::double precision between 0 and 360 then (p_sample->>'heading')::double precision end,
    device,(p_sample->>'sample_id')::uuid,true)
  on conflict(couple_id,user_id) do update set lat=excluded.lat,lng=excluded.lng,updated_at=excluded.updated_at,captured_at=excluded.captured_at,
    accuracy_m=excluded.accuracy_m,speed_mps=excluded.speed_mps,heading=excluded.heading,device_id=excluded.device_id,sample_id=excluded.sample_id,sharing=true;
  if v.history_enabled then
    insert into public.location_history(couple_id,user_id,lat,lng,recorded_at)
    select c,auth.uid(),lat,lng,t where not exists(select 1 from public.location_history where user_id=auth.uid() and recorded_at>t-interval '15 minutes');
  end if;
  return true;
end $$;
-- Older clients cannot bypass explicit consent.
revoke execute on function public.publish_location(double precision,double precision) from authenticated;

create or replace function public.clear_location_history()
returns void language sql security definer set search_path=public as $$ delete from public.location_history where user_id=auth.uid(); $$;

create or replace function public.send_message_v2(p_text text,p_client_id uuid,p_expected_user_id uuid,p_couple_id uuid)
returns public.messages language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id(); v public.messages;
begin
  if auth.uid() is distinct from p_expected_user_id or c is distinct from p_couple_id or not public.is_complete_couple(c) or p_client_id is null then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  insert into public.messages(couple_id,sender_id,type,text,client_id) values(c,auth.uid(),'text',trim(p_text),p_client_id)
  on conflict(sender_id,client_id) where client_id is not null do update set client_id=excluded.client_id
  returning * into v;
  return v;
end $$;

create or replace function public.mark_notification_read(p_id uuid)
returns void language sql security definer set search_path=public as $$
  update public.notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=auth.uid();
$$;

create or replace function public.prepare_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.dedupe_key like 'geofence:%' then
    new.kind:='geofence'; new.data:=jsonb_build_object('screen','Mapa'); new.expires_at:=now()+interval '30 minutes';
  elsif new.dedupe_key like 'special-date:%' then
    new.kind:='dates'; new.data:=jsonb_build_object('screen','Fechas');
  end if;
  if new.couple_id is null then select couple_id into new.couple_id from public.couple_members where user_id=new.user_id; end if;
  new.push_enabled_at_creation:=public.notification_allowed(new.user_id,new.kind);
  new.data:=new.data || jsonb_build_object('notificationId',new.id,'coupleId',new.couple_id);
  return new;
end $$;
create trigger notification_prepare before insert on public.notifications for each row execute function public.prepare_notification();

create or replace function public.queue_message_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data)
  select user_id,new.couple_id,'message:'||new.id,case when new.type='love' then 'Tu pareja te ha enviado amor' else 'Nuevo mensaje' end,
    case when new.type='love' then 'Un gesto para vuestro día 💜' else left(new.text,180) end,
    case when new.type='love' then 'love' else 'chat' end,jsonb_build_object('screen','Chat','messageId',new.id)
  from public.couple_members where couple_id=new.couple_id and user_id<>new.sender_id;
  return new;
end $$;
create trigger message_notification after insert on public.messages for each row execute function public.queue_message_notification();

create or replace function public.queue_story_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data,expires_at)
  select user_id,new.couple_id,'story:'||new.id,'Nueva historia','Tu pareja ha compartido una foto','stories',jsonb_build_object('screen','Historias'),new.expires_at
  from public.couple_members where couple_id=new.couple_id and user_id<>new.author_id;
  return new;
end $$;
create trigger story_notification after insert on public.stories for each row execute function public.queue_story_notification();

create or replace function public.notification_allowed(p_user_id uuid,p_kind text)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select notifications_enabled and case p_kind
    when 'chat' then chat_enabled when 'love' then love_enabled when 'geofence' then geofence_enabled
    when 'status' then stories_enabled when 'live' then geofence_enabled when 'stories' then stories_enabled when 'dates' then dates_enabled else false end
    from public.user_settings where user_id=p_user_id),false);
$$;

create or replace function public.claim_push_deliveries(p_limit integer default 100)
returns table(id uuid,lease_id uuid,push_token text,title text,body text,kind text,data jsonb,attempt_count integer,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if p_limit not between 1 and 100 or p_limit is null then raise exception 'Límite no válido'; end if;
  insert into public.notification_deliveries(notification_id,device_id,push_token)
  select n.id,d.id,d.expo_push_token from public.notifications n join public.devices d on d.user_id=n.user_id
  where n.push_enabled_at_creation and n.expires_at>now() and n.created_at>now()-interval '1 day' and d.expo_push_token is not null
    and public.notification_allowed(n.user_id,n.kind)
  on conflict(notification_id,device_id) do nothing;
  update public.notification_deliveries d set status='expired',lease_id=null,claimed_at=null
  from public.notifications n where n.id=d.notification_id and d.status in ('pending','processing') and
    (n.expires_at<=now() or not public.notification_allowed(n.user_id,n.kind));
  update public.notification_deliveries d set status='failed',lease_id=null,claimed_at=null
    where d.status='processing' and d.claimed_at<now()-interval '2 minutes' and d.attempt_count>=5;
  return query with candidates as (
    select d.id from public.notification_deliveries d join public.notifications n on n.id=d.notification_id
    join public.devices device on device.id=d.device_id and device.user_id=n.user_id and device.expo_push_token=d.push_token
    where d.attempt_count<5 and n.expires_at>now() and public.notification_allowed(n.user_id,n.kind) and
      ((d.status='pending' and d.next_attempt_at<=now()) or (d.status='processing' and d.claimed_at<now()-interval '2 minutes'))
    order by d.next_attempt_at for update of d skip locked limit p_limit
  ), claimed as (
    update public.notification_deliveries d set status='processing',lease_id=extensions.gen_random_uuid(),claimed_at=now(),attempt_count=d.attempt_count+1,updated_at=now()
    from candidates c where d.id=c.id returning d.*
  ) select d.id,d.lease_id,d.push_token,n.title,
    case when s.preview_enabled then n.body else 'Abre CoupleApp para ver el aviso' end,n.kind,n.data,d.attempt_count,n.expires_at
  from claimed d join public.notifications n on n.id=d.notification_id join public.user_settings s on s.user_id=n.user_id;
end $$;

create or replace function public.update_profile(p_name text,p_avatar_path text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_avatar_path is not null and p_avatar_path not like auth.uid()::text||'/%' then raise exception 'Avatar no autorizado' using errcode='42501'; end if;
  update public.profiles set name=trim(p_name),avatar_url=coalesce(p_avatar_path,avatar_url) where id=auth.uid();
end $$;

create or replace function public.leave_couple()
returns void language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id();
begin
  if c is null then return; end if;
  perform 1 from public.couples where id=c for update;
  update public.user_settings set location_mode='off',live_until=null,tracking_device_id=null,updated_at=now()
    where user_id in(select user_id from public.couple_members where couple_id=c);
  -- Keep expired story rows until the storage worker has removed the files.
  update public.stories set expires_at=greatest(created_at+interval '1 millisecond',now()) where couple_id=c;
  delete from public.live_location_requests where couple_id=c;
  delete from public.notifications where couple_id=c;
  delete from public.locations where couple_id=c;
  delete from public.location_history where couple_id=c;
  delete from public.geofences where couple_id=c;
  delete from public.messages where couple_id=c;
  delete from public.love_events where couple_id=c;
  delete from public.special_dates where couple_id=c;
  delete from public.couple_members where couple_id=c;
  update public.couples set invite_code=null where id=c;
end $$;

create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);
create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.leave_couple();
  insert into public.account_deletion_requests(user_id) values(auth.uid()) on conflict do nothing;
  delete from public.devices where user_id=auth.uid();
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',false,2097152,array['image/jpeg']) on conflict(id) do update set
  public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy avatar_read on storage.objects for select to authenticated using(bucket_id='avatars' and
  (public.try_uuid((storage.foldername(name))[1])=auth.uid() or public.shares_couple(public.try_uuid((storage.foldername(name))[1]))));
create policy avatar_write on storage.objects for insert to authenticated with check(bucket_id='avatars' and public.try_uuid((storage.foldername(name))[1])=auth.uid());
create policy avatar_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and public.try_uuid((storage.foldername(name))[1])=auth.uid());

alter table public.user_settings enable row level security;
alter table public.devices enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.account_deletion_requests enable row level security;
revoke all on public.user_settings,public.devices,public.notification_deliveries,public.account_deletion_requests from anon,authenticated;
grant select on public.user_settings to authenticated;
grant all on public.user_settings,public.devices,public.notification_deliveries,public.account_deletion_requests to service_role;
create policy settings_own on public.user_settings for select to authenticated using(user_id=auth.uid());

revoke all on function public.save_settings(jsonb,uuid) from public;
revoke all on function public.register_device(uuid,text,text,text,uuid) from public;
revoke all on function public.revoke_device(uuid) from public;
revoke all on function public.publish_location_sample(jsonb) from public;
revoke all on function public.clear_location_history() from public;
revoke all on function public.send_message_v2(text,uuid,uuid,uuid) from public;
revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.update_profile(text,text) from public;
revoke all on function public.leave_couple() from public;
revoke all on function public.request_account_deletion() from public;
revoke all on function public.prepare_notification() from public;
revoke all on function public.queue_message_notification() from public;
revoke all on function public.queue_story_notification() from public;
revoke all on function public.notification_allowed(uuid,text) from public;
revoke all on function public.claim_push_deliveries(integer) from public;
grant execute on function public.save_settings(jsonb,uuid) to authenticated;
grant execute on function public.register_device(uuid,text,text,text,uuid) to authenticated;
grant execute on function public.revoke_device(uuid) to authenticated;
grant execute on function public.publish_location_sample(jsonb) to authenticated;
grant execute on function public.clear_location_history() to authenticated;
grant execute on function public.send_message_v2(text,uuid,uuid,uuid) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.update_profile(text,text) to authenticated;
grant execute on function public.leave_couple() to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.notification_allowed(uuid,text) to service_role;
grant execute on function public.claim_push_deliveries(integer) to service_role;

do $$ declare t text; begin
  foreach t in array array['user_settings','notifications'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

-- Profile events remain readable after membership is removed, so both clients can clear their state.
alter table public.profiles add column relationship_updated_at timestamptz not null default now();
create or replace function public.notify_membership_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then update public.profiles set relationship_updated_at=now() where id=old.user_id; return old; end if;
  if exists(select 1 from public.account_deletion_requests where user_id=new.user_id) then raise exception 'Cuenta pendiente de eliminación' using errcode='42501'; end if;
  update public.profiles set relationship_updated_at=now() where id=new.user_id;
  return new;
end $$;
create trigger membership_change before insert or delete on public.couple_members for each row execute function public.notify_membership_change();
revoke all on function public.notify_membership_change() from public;

create or replace function public.invoke_push_worker()
returns bigint language plpgsql security definer set search_path=public as $$
declare endpoint text; secret text; request_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into endpoint using 'coupleapp_functions_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into secret using 'coupleapp_scheduler_key';
  if endpoint is null or secret is null then return null; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
    into request_id using rtrim(endpoint,'/')||'/push',jsonb_build_object('Content-Type','application/json','apikey',secret),'{}'::jsonb;
  return request_id;
end $$;
create or replace function public.wake_push_worker()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.invoke_push_worker();
  return null;
exception when others then
  -- The minute scheduler recovers a failed wakeup; never roll back the user's message.
  raise warning 'Push wakeup failed; scheduler will retry';
  return null;
end $$;
create trigger notification_wakeup after insert on public.notifications for each statement execute function public.wake_push_worker();
revoke all on function public.invoke_push_worker() from public;
revoke all on function public.wake_push_worker() from public;
grant execute on function public.invoke_push_worker() to service_role;
select cron.schedule('coupleapp-push-worker','* * * * *','select public.invoke_push_worker();');


create or replace function public.record_geofence_entry_v2(p_geofence_id uuid,p_event_id uuid,p_recorded_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare g public.geofences; previous uuid;
begin
  select * into g from public.geofences where id=p_geofence_id and user_id=auth.uid();
  if g.id is null or not public.is_complete_couple(g.couple_id) then raise exception 'Lugar no autorizado' using errcode='42501'; end if;
  if p_event_id is null or p_recorded_at is null or p_recorded_at<now()-interval '30 minutes' or p_recorded_at>now()+interval '1 minute' then raise exception 'Evento caducado' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(g.id::text,3));
  select id into previous from public.geofence_events where user_id=auth.uid() and geofence_id=g.id and
    (id=p_event_id or created_at between p_recorded_at-interval '15 minutes' and p_recorded_at+interval '15 minutes') order by created_at desc limit 1;
  if previous is not null then return previous; end if;
  insert into public.geofence_events(id,couple_id,user_id,geofence_id,event_type,created_at) values(p_event_id,g.couple_id,auth.uid(),g.id,'enter',p_recorded_at);
  return p_event_id;
end $$;
revoke all on function public.record_geofence_entry_v2(uuid,uuid,timestamptz) from public;
grant execute on function public.record_geofence_entry_v2(uuid,uuid,timestamptz) to authenticated;


create table public.live_location_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default(now()+interval '5 minutes')
);
alter table public.live_location_requests enable row level security;
revoke all on public.live_location_requests from anon,authenticated;
grant select on public.live_location_requests to authenticated;
grant all on public.live_location_requests to service_role;
create policy live_requests_member on public.live_location_requests for select to authenticated using(public.is_couple_member(couple_id));
create or replace function public.request_live_location()
returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id(); target uuid; request_id uuid;
begin
  if not public.is_complete_couple(c) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,5));
  select id into request_id from public.live_location_requests where requester_id=auth.uid() and couple_id=c and created_at>now()-interval '5 minutes';
  if request_id is not null then return request_id; end if;
  select user_id into target from public.couple_members where couple_id=c and user_id<>auth.uid();
  insert into public.live_location_requests(couple_id,requester_id,target_id) values(c,auth.uid(),target) returning id into request_id;
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data,expires_at)
  values(target,c,'live:'||request_id,'Solicitud de ubicación en vivo','Tu pareja te pide compartir durante 15 minutos. Tú decides si aceptas.','live',jsonb_build_object('screen','Mapa','requestId',request_id),now()+interval '5 minutes');
  return request_id;
end $$;
create or replace function public.respond_live_location(p_id uuid,p_accept boolean,p_device_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.live_location_requests;
begin
  select * into r from public.live_location_requests where id=p_id and target_id=auth.uid() and status='pending' and expires_at>now() for update;
  if r.id is null or not public.is_complete_couple(r.couple_id) then raise exception 'Solicitud caducada o no autorizada' using errcode='42501'; end if;
  if p_accept then perform public.save_settings(jsonb_build_object('location_mode','live'),p_device_id); end if;
  update public.live_location_requests set status=case when p_accept then 'accepted' else 'declined' end where id=r.id;
  update public.notifications set expires_at=now(),read_at=now() where dedupe_key='live:'||r.id and user_id=auth.uid();
end $$;
revoke all on function public.request_live_location() from public;
revoke all on function public.respond_live_location(uuid,boolean,uuid) from public;
grant execute on function public.request_live_location() to authenticated;
grant execute on function public.respond_live_location(uuid,boolean,uuid) to authenticated;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='live_location_requests') then
    alter publication supabase_realtime add table public.live_location_requests;
  end if;
end $$;

create or replace function public.queue_special_date_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_special record;
  v_member record;
  v_target date;
  v_year integer;
  v_last_day integer;
  v_days integer;
  v_created integer := 0;
begin
  if extract(hour from (now() at time zone 'Europe/Madrid'))::integer not between 9 and 11 then
    return 0;
  end if;

  for v_special in select * from public.special_dates loop
    if v_special.recurring then
      v_year := extract(year from v_today)::integer;
      v_last_day := extract(
        day from (make_date(v_year, extract(month from v_special.date)::integer, 1)
          + interval '1 month - 1 day')
      )::integer;
      v_target := make_date(
        v_year,
        extract(month from v_special.date)::integer,
        least(extract(day from v_special.date)::integer, v_last_day)
      );

      if v_target < v_today then
        v_year := v_year + 1;
        v_last_day := extract(
          day from (make_date(v_year, extract(month from v_special.date)::integer, 1)
            + interval '1 month - 1 day')
        )::integer;
        v_target := make_date(
          v_year,
          extract(month from v_special.date)::integer,
          least(extract(day from v_special.date)::integer, v_last_day)
        );
      end if;
    else
      v_target := v_special.date;
    end if;

    v_days := v_target - v_today;
    if v_days in (0, v_special.notify_days_before) then
      for v_member in
        select user_id
        from public.couple_members
        where couple_id = v_special.couple_id
      loop
        insert into public.notifications (user_id, dedupe_key, title, body)
        values (
          v_member.user_id,
          'special-date:' || v_special.id::text || ':' || v_target::text || ':' || v_days::text,
          case when v_days = 0 then '¡Es hoy! 🎉' else 'Fecha especial próxima' end,
          case when v_days = 0 then v_special.title else v_special.title || ' en ' || v_days || ' días' end
        )
        on conflict (user_id, dedupe_key) do nothing;
        if found then
          v_created := v_created + 1;
        end if;
      end loop;
    end if;
  end loop;
  return v_created;
end;
$$;

create or replace function public.invoke_maintenance_worker()
returns bigint language plpgsql security definer set search_path=public as $$
declare endpoint text; secret text; request_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into endpoint using 'coupleapp_functions_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into secret using 'coupleapp_scheduler_key';
  if endpoint is null or secret is null then return null; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
    into request_id using rtrim(endpoint,'/')||'/maintenance',jsonb_build_object('Content-Type','application/json','apikey',secret),'{}'::jsonb;
  return request_id;
end $$;
revoke all on function public.invoke_maintenance_worker() from public;
grant execute on function public.invoke_maintenance_worker() to service_role;
select cron.schedule('coupleapp-maintenance-worker','*/5 * * * *','select public.invoke_maintenance_worker();');
select cron.schedule('coupleapp-clean-notifications','35 3 * * *',
  'delete from public.notifications where created_at < now() - interval ''30 days''; delete from public.live_location_requests where expires_at < now() - interval ''1 day'';');


create or replace function public.queue_status_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare c uuid;
begin
  if new.status_text='' or (new.status_text=old.status_text and new.status_emoji=old.status_emoji) then return new; end if;
  select couple_id into c from public.couple_members where user_id=new.id;
  if c is null then return new; end if;
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data)
  select user_id,c,'status:'||new.id||':'||new.status_updated_at,'Nuevo estado de tu pareja',new.status_text,'status',jsonb_build_object('screen','Estado')
  from public.couple_members where couple_id=c and user_id<>new.id;
  return new;
end $$;
create trigger status_notification after update of status_text,status_emoji on public.profiles for each row execute function public.queue_status_notification();
revoke all on function public.queue_status_notification() from public;

notify pgrst,'reload schema';

alter table public.user_settings add column if not exists auto_live_enabled boolean not null default false;

-- A viewer renews a short lease only while their map is visible.
create table if not exists public.map_view_sessions (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  session_id uuid not null,
  couple_id uuid not null references public.couples(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key(viewer_id,device_id),
  check(viewer_id<>target_id)
);
create index if not exists map_view_sessions_target_idx on public.map_view_sessions(target_id,expires_at);
alter table public.map_view_sessions enable row level security;
revoke all on public.map_view_sessions from anon, authenticated;
drop policy if exists map_sessions_read on public.map_view_sessions;
create policy map_sessions_read on public.map_view_sessions for select to authenticated
  using ((viewer_id=auth.uid() or target_id=auth.uid()) and couple_id=public.current_couple_id());
grant select on public.map_view_sessions to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='map_view_sessions') then
    alter publication supabase_realtime add table public.map_view_sessions;
  end if;
end $$;

create or replace function public.set_auto_live_enabled(p_enabled boolean)
returns public.user_settings language plpgsql security definer set search_path=public as $$
declare result public.user_settings;
begin
  if auth.uid() is null or p_enabled is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  insert into public.user_settings(user_id) values(auth.uid()) on conflict do nothing;
  update public.user_settings set auto_live_enabled=p_enabled,updated_at=now()
    where user_id=auth.uid() returning * into result;
  return result;
end $$;

create or replace function public.invalidate_map_sessions()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not new.auto_live_enabled or new.location_mode='off'
    or new.tracking_device_id is distinct from old.tracking_device_id then
    update public.map_view_sessions set expires_at=now() where target_id=new.user_id and expires_at>now();
  end if;
  return new;
end $$;
drop trigger if exists invalidate_map_sessions on public.user_settings;
create trigger invalidate_map_sessions after update on public.user_settings
  for each row execute function public.invalidate_map_sessions();

create or replace function public.renew_map_view(p_device_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id(); target uuid; settings public.user_settings;
  previous public.map_view_sessions; deadline timestamptz;
begin
  if auth.uid() is null or p_session_id is null or not public.is_complete_couple(c)
    or not exists(select 1 from public.devices where id=p_device_id and user_id=auth.uid()) then
    raise exception 'Dispositivo o pareja no disponibles' using errcode='42501';
  end if;
  select user_id into target from public.couple_members where couple_id=c and user_id<>auth.uid();
  -- Serialize renewals with consent changes and pauses.
  select * into settings from public.user_settings where user_id=target for update;
  if settings.user_id is null or not settings.auto_live_enabled then
    return jsonb_build_object('status','consent_required');
  end if;
  if settings.location_mode='off' or settings.tracking_device_id is null
    or (settings.location_mode='live' and settings.live_until<=now()) then
    return jsonb_build_object('status','paused');
  end if;
  select * into previous from public.map_view_sessions where viewer_id=auth.uid() and device_id=p_device_id;
  if previous.session_id=p_session_id and previous.started_at+interval '15 minutes'<=now() then
    return jsonb_build_object('status','expired');
  end if;
  deadline:=least(now()+interval '90 seconds',
    (case when previous.session_id=p_session_id then previous.started_at else now() end)+interval '15 minutes');
  insert into public.map_view_sessions(viewer_id,device_id,session_id,couple_id,target_id,expires_at)
    values(auth.uid(),p_device_id,p_session_id,c,target,deadline)
    on conflict(viewer_id,device_id) do update set session_id=excluded.session_id,couple_id=c,target_id=target,
      started_at=case when map_view_sessions.session_id=p_session_id then map_view_sessions.started_at else now() end,
      expires_at=deadline;
  -- Only a wake hint: the receiver revalidates authenticated state, never trusts this payload.
  if (previous.expires_at is null or previous.expires_at<=now() or previous.session_id<>p_session_id)
    and not exists(select 1 from public.notifications where user_id=target
      and data->>'type'='tracking_control' and created_at>now()-interval '1 minute') then
    insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data,expires_at)
      values(target,c,'map:'||extensions.gen_random_uuid(),'Ubicación bajo demanda','Actualización de sesión','live',
        jsonb_build_object('type','tracking_control','screen','Mapa'),deadline);
  end if;
  return jsonb_build_object('status','requested','expiresAt',deadline);
end $$;

create or replace function public.end_map_view(p_device_id uuid,p_session_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.map_view_sessions set expires_at=now()
    where viewer_id=auth.uid() and device_id=p_device_id and session_id=p_session_id;
end $$;

create or replace function public.get_tracking_config(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.user_settings; deadline timestamptz;
begin
  if auth.uid() is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  select * into s from public.user_settings where user_id=auth.uid();
  if s.user_id is null or s.tracking_device_id is distinct from p_device_id
    or not exists(select 1 from public.devices where id=p_device_id and user_id=auth.uid()) then return null; end if;
  if s.location_mode='balanced' and s.auto_live_enabled then
    select max(expires_at) into deadline from public.map_view_sessions
      where target_id=auth.uid() and couple_id=public.current_couple_id()
      and public.is_complete_couple(couple_id) and expires_at>now();
  end if;
  return to_jsonb(s)||jsonb_build_object('userId',auth.uid(),'auto_live_until',deadline);
end $$;

revoke all on function public.set_auto_live_enabled(boolean) from public;
revoke all on function public.invalidate_map_sessions() from public;
revoke all on function public.renew_map_view(uuid,uuid) from public;
revoke all on function public.end_map_view(uuid,uuid) from public;
revoke all on function public.get_tracking_config(uuid) from public;
grant execute on function public.set_auto_live_enabled(boolean) to authenticated;
grant execute on function public.renew_map_view(uuid,uuid) to authenticated;
grant execute on function public.end_map_view(uuid,uuid) to authenticated;
grant execute on function public.get_tracking_config(uuid) to authenticated;

alter table public.user_settings add column if not exists location_options jsonb not null default '{"normal_distance":50,"normal_interval":120,"live_interval":20,"battery_threshold":20,"low_battery_mode":"balanced","share_battery":true,"share_activity":true,"save_trips":true,"motion_assist":true}';
alter table public.user_settings add column if not exists event_options jsonb not null default '{"enter":true,"exit":true,"walking":true,"cycling":true,"driving":true,"stationary":false,"trip":true}';
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check check(type in ('text','love','event'));
alter table public.messages add column if not exists metadata jsonb not null default '{}';
alter table public.stories add column if not exists media_type text not null default 'image' check(media_type in ('image','video'));
alter table public.stories add column if not exists caption text not null default '' check(char_length(caption)<=1000);
alter table public.locations add column if not exists battery_level integer check(battery_level between 0 and 100);
alter table public.locations add column if not exists charging boolean;
alter table public.locations add column if not exists activity text check(activity in ('unknown','stationary','walking','cycling','driving'));
alter table public.locations add column if not exists activity_confidence text check(activity_confidence in ('low','medium','high'));
alter table public.geofence_events drop constraint if exists geofence_events_event_type_check;
alter table public.geofence_events add constraint geofence_events_event_type_check check(event_type in ('enter','exit'));

create or replace function public.save_behavior_options(p_location jsonb default '{}',p_events jsonb default '{}')
returns public.user_settings language plpgsql security definer set search_path=public as $$
declare s public.user_settings; k text; o jsonb; e jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  if jsonb_typeof(p_location)<>'object' or jsonb_typeof(p_events)<>'object' or p_location is null or p_events is null then raise exception 'Opciones no válidas'; end if;
  insert into public.user_settings(user_id) values(auth.uid()) on conflict do nothing;
  select * into s from public.user_settings where user_id=auth.uid() for update;
  for k in select jsonb_object_keys(p_location) loop
    if not s.location_options ? k then raise exception 'Opción desconocida: %',k; end if;
    if jsonb_typeof(p_location->k) is distinct from jsonb_typeof(s.location_options->k) then raise exception 'Tipo incorrecto: %',k; end if;
  end loop;
  for k in select jsonb_object_keys(p_events) loop
    if not s.event_options ? k or jsonb_typeof(p_events->k)<>'boolean' then raise exception 'Aviso no válido: %',k; end if;
  end loop;
  o:=s.location_options||p_location; e:=s.event_options||p_events;
  if not (o->>'normal_distance')::numeric between 25 and 1000
    or not (o->>'normal_interval')::numeric between 30 and 900
    or not (o->>'live_interval')::numeric between 5 and 60
    or not (o->>'battery_threshold')::numeric between 5 and 50
    or o->>'low_battery_mode' not in ('balanced','off','live') then raise exception 'Opciones fuera de rango'; end if;
  update public.user_settings set location_options=o,event_options=e,updated_at=now() where user_id=auth.uid() returning * into s;
  if not (o->>'share_battery')::boolean then update public.locations set battery_level=null,charging=null where user_id=auth.uid(); end if;
  if not (o->>'share_activity')::boolean then update public.locations set activity=null,activity_confidence=null where user_id=auth.uid(); end if;
  return s;
end $$;

create or replace function public.notification_allowed(p_user_id uuid,p_kind text)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select notifications_enabled and case p_kind
    when 'chat' then chat_enabled when 'love' then love_enabled
    when 'geofence' then geofence_enabled and (event_options->>'enter')::boolean
    when 'exit' then geofence_enabled and (event_options->>'exit')::boolean
    when 'walking' then (event_options->>'walking')::boolean
    when 'cycling' then (event_options->>'cycling')::boolean
    when 'driving' then (event_options->>'driving')::boolean
    when 'stationary' then (event_options->>'stationary')::boolean
    when 'trip' then (event_options->>'trip')::boolean
    when 'status' then stories_enabled when 'live' then geofence_enabled
    when 'stories' then stories_enabled when 'dates' then dates_enabled else false end
    from public.user_settings where user_id=p_user_id),false);
$$;

create or replace function public.queue_message_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.type='event' then return new; end if;
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data)
    select user_id,new.couple_id,'message:'||new.id,case when new.type='love' then 'Tu pareja te ha enviado amor' else 'Nuevo mensaje' end,
      case when new.type='love' then 'Un gesto para vuestro día 💜' else left(new.text,180) end,
      case when new.type='love' then 'love' else 'chat' end,jsonb_build_object('screen','Chat','messageId',new.id)
      from public.couple_members where couple_id=new.couple_id and user_id<>new.sender_id;
  return new;
end $$;

create or replace function public.send_love_v2(p_couple_id uuid,p_client_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d date:=(now() at time zone 'Europe/Madrid')::date; member public.couple_members; event_id uuid;
begin
  select * into member from public.couple_members where couple_id=p_couple_id and user_id=auth.uid() for update;
  if member.user_id is null or not public.is_complete_couple(p_couple_id) or p_client_id is null then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  if exists(select 1 from public.messages where sender_id=auth.uid() and client_id=p_client_id) then
    return jsonb_build_object('sentNow',false,'sentToday',member.last_love_date=d,'streakCount',member.love_streak_count);
  end if;
  insert into public.love_events(couple_id,user_id,sent_on) values(p_couple_id,auth.uid(),d)
    on conflict(couple_id,user_id,sent_on) do nothing returning id into event_id;
  if event_id is not null then
    member.love_streak_count:=case when member.last_love_date=d-1 then member.love_streak_count+1 else 1 end;
    update public.couple_members set love_streak_count=member.love_streak_count,last_love_date=d
      where couple_id=p_couple_id and user_id=auth.uid();
  end if;
  insert into public.messages(couple_id,sender_id,type,text,client_id)
    values(p_couple_id,auth.uid(),'love','💜',p_client_id);
  return jsonb_build_object('sentNow',true,'sentToday',true,'streakCount',member.love_streak_count);
end $$;
create or replace function public.send_love(p_couple_id uuid)
returns jsonb language sql security definer set search_path=public as $$
  select public.send_love_v2(p_couple_id,extensions.gen_random_uuid());
$$;

create or replace function public.record_geofence_transition(p_geofence_id uuid,p_event_id uuid,p_recorded_at timestamptz,p_transition text)
returns uuid language plpgsql security definer set search_path=public as $$
declare g public.geofences; previous public.geofence_events;
begin
  select * into g from public.geofences where id=p_geofence_id and user_id=auth.uid();
  if g.id is null or not public.is_complete_couple(g.couple_id) then raise exception 'Lugar no autorizado' using errcode='42501'; end if;
  if p_transition is null or p_transition not in ('enter','exit') or p_event_id is null or p_recorded_at is null or p_recorded_at<now()-interval '30 minutes' or p_recorded_at>now()+interval '1 minute' then raise exception 'Evento no válido' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(g.id::text,3));
  select * into previous from public.geofence_events where user_id=auth.uid() and id=p_event_id;
  if previous.id is not null then return previous.id; end if;
  select * into previous from public.geofence_events where user_id=auth.uid() and geofence_id=g.id order by created_at desc limit 1;
  if previous.created_at>=p_recorded_at or (previous.event_type=p_transition and previous.created_at>p_recorded_at-interval '15 minutes') then return previous.id; end if;
  insert into public.geofence_events(id,couple_id,user_id,geofence_id,event_type,created_at)
    values(p_event_id,g.couple_id,auth.uid(),g.id,p_transition,p_recorded_at);
  return p_event_id;
end $$;
create or replace function public.queue_geofence_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare place_name text; body_text text;
begin
  select name into place_name from public.geofences where id=new.geofence_id;
  body_text:=(case when new.event_type='enter' then 'Ha llegado a ' else 'Ha salido de ' end)||coalesce(place_name,'un lugar guardado');
  insert into public.messages(couple_id,sender_id,type,text,metadata,created_at)
    values(new.couple_id,new.user_id,'event',body_text,jsonb_build_object('kind',new.event_type,'placeId',new.geofence_id),new.created_at);
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data,expires_at)
    select user_id,new.couple_id,'place-transition:'||new.id,'Aviso de lugar',body_text,
      case when new.event_type='enter' then 'geofence' else 'exit' end,jsonb_build_object('screen','Chat'),now()+interval '30 minutes'
      from public.couple_members where couple_id=new.couple_id and user_id<>new.user_id;
  return new;
end $$;

create or replace function public.create_story_v2(p_image_path text,p_media_type text,p_caption text)
returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id(); story_id uuid;
begin
  if c is null or not public.is_complete_couple(c) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  if p_caption is null or char_length(p_caption)>1000 or p_media_type is null or p_media_type not in ('image','video')
    or p_image_path is null or split_part(p_image_path,'/',1)<>c::text or split_part(p_image_path,'/',2)<>auth.uid()::text
    or (p_media_type='image' and p_image_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{13}\.(jpg|png|webp|heic|heif)$')
    or (p_media_type='video' and p_image_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{13}\.(mp4|mov)$') then raise exception 'Historia no válida' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects where bucket_id='stories' and name=p_image_path) then raise exception 'Archivo no disponible' using errcode='P0002'; end if;
  insert into public.stories(couple_id,author_id,image_path,media_type,caption)
    values(c,auth.uid(),p_image_path,p_media_type,trim(p_caption)) returning id into story_id;
  return story_id;
end $$;
create or replace function public.queue_story_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare description text;
begin
  description:=case when new.media_type='video' then 'Ha compartido un vídeo' else 'Ha compartido una foto' end;
  insert into public.messages(couple_id,sender_id,type,text,metadata)
    values(new.couple_id,new.author_id,'event',description||case when new.caption<>'' then ': '||new.caption else '' end,
      jsonb_build_object('kind','story','storyId',new.id,'mediaType',new.media_type));
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data,expires_at)
    select user_id,new.couple_id,'story:'||new.id,'Nueva historia',description,'stories',
      jsonb_build_object('screen','Historias','storyId',new.id),new.expires_at
      from public.couple_members where couple_id=new.couple_id and user_id<>new.author_id;
  return new;
end $$;
update storage.buckets set file_size_limit=52428800,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime'] where id='stories';
alter policy story_files_insert_member on storage.objects with check (
  bucket_id='stories' and public.is_complete_couple(public.try_uuid((storage.foldername(name))[1]))
  and public.try_uuid((storage.foldername(name))[2])=auth.uid()
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{13}\.(jpg|png|webp|heic|heif|mp4|mov)$'
);

-- Keep the original validated location RPC private, then enrich the same fix.
do $$ begin
  -- Never copy the enriched wrapper over its own implementation on a retry.
  if to_regprocedure('public.publish_location_fix(jsonb)') is null then
    execute replace(pg_get_functiondef('public.publish_location_sample(jsonb)'::regprocedure),
      'public.publish_location_sample(', 'public.publish_location_fix(');
  end if;
end $$;
revoke all on function public.publish_location_fix(jsonb) from public,anon,authenticated;
create or replace function public.publish_location_sample(p_sample jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare accepted boolean; options jsonb;
begin
  accepted:=public.publish_location_fix(p_sample);
  if not accepted then return false; end if;
  select location_options into options from public.user_settings where user_id=auth.uid();
  update public.locations set
    battery_level=case when (options->>'share_battery')::boolean and (p_sample->>'battery_level')::numeric between 0 and 100 then (p_sample->>'battery_level')::integer end,
    charging=case when (options->>'share_battery')::boolean then (p_sample->>'charging')::boolean end,
    activity=case when (options->>'share_activity')::boolean and p_sample->>'activity' in ('unknown','stationary','walking','cycling','driving') then p_sample->>'activity' end,
    activity_confidence=case when (options->>'share_activity')::boolean and p_sample->>'activity_confidence' in ('low','medium','high') then p_sample->>'activity_confidence' end
    where user_id=auth.uid();
  return true;
end $$;

revoke all on function public.save_behavior_options(jsonb,jsonb) from public;
revoke all on function public.send_love_v2(uuid,uuid) from public;
revoke all on function public.record_geofence_transition(uuid,uuid,timestamptz,text) from public;
revoke all on function public.create_story_v2(text,text,text) from public;
grant execute on function public.save_behavior_options(jsonb,jsonb) to authenticated;
grant execute on function public.send_love_v2(uuid,uuid) to authenticated;
grant execute on function public.record_geofence_transition(uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.create_story_v2(text,text,text) to authenticated;

create table if not exists public.trips (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null,
  last_sample_at timestamptz not null,
  last_moved_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  distance_m double precision not null default 0,
  points jsonb not null default '[]',
  activity text
);
create unique index if not exists one_open_trip_per_user on public.trips(user_id) where ended_at is null;
alter table public.trips enable row level security;
revoke all on public.trips from anon,authenticated;
grant select on public.trips to authenticated;
drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips for select to authenticated
  using(couple_id=public.current_couple_id() and public.is_complete_couple(couple_id));
create table if not exists public.activity_states (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  candidate text,
  candidate_since timestamptz,
  confirmed text,
  last_notice_at timestamptz
);
alter table public.activity_states enable row level security;
revoke all on public.activity_states from anon,authenticated;

create or replace function public.finish_trip(p_user_id uuid,p_reason text,p_time timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare trip public.trips; description text;
begin
  update public.trips set ended_at=greatest(started_at,p_time),end_reason=p_reason
    where user_id=p_user_id and ended_at is null returning * into trip;
  if trip.id is null then return; end if;
  if trip.distance_m<50 or jsonb_array_length(trip.points)<2 then delete from public.trips where id=trip.id; return; end if;
  description:=case when p_reason='paused' then 'Recorrido interrumpido' else 'Recorrido finalizado' end||' · '||round(trip.distance_m)::text||' m';
  insert into public.messages(couple_id,sender_id,type,text,metadata)
    values(trip.couple_id,p_user_id,'event',description,jsonb_build_object('kind','trip','tripId',trip.id));
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data)
    select user_id,trip.couple_id,'trip:'||trip.id,'Recorrido compartido',description,'trip',jsonb_build_object('screen','Chat','tripId',trip.id)
      from public.couple_members where couple_id=trip.couple_id and user_id<>p_user_id;
end $$;

create or replace function public.process_location_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare options jsonb; trip public.trips; state public.activity_states; p jsonb; meters double precision; description text;
begin
  if not new.sharing or new.accuracy_m is null or new.accuracy_m>100 then return new; end if;
  select location_options into options from public.user_settings where user_id=new.user_id;
  if (options->>'share_activity')::boolean and new.activity in ('stationary','walking','cycling','driving')
    and new.activity_confidence in ('medium','high') then
    insert into public.activity_states(user_id,couple_id,candidate,candidate_since)
      values(new.user_id,new.couple_id,new.activity,new.captured_at) on conflict(user_id) do nothing;
    select * into state from public.activity_states where user_id=new.user_id for update;
    if state.couple_id<>new.couple_id or state.candidate is distinct from new.activity then
      update public.activity_states set couple_id=new.couple_id,candidate=new.activity,candidate_since=new.captured_at where user_id=new.user_id;
    elsif new.captured_at-state.candidate_since>=interval '30 seconds' and state.confirmed is distinct from new.activity
      and (state.last_notice_at is null or new.captured_at-state.last_notice_at>=interval '2 minutes') then
      update public.activity_states set confirmed=new.activity,last_notice_at=new.captured_at where user_id=new.user_id;
      description:=case new.activity when 'walking' then 'Está caminando' when 'cycling' then 'Va en bicicleta' when 'driving' then 'Se desplaza en vehículo' else 'Ha dejado de moverse' end;
      insert into public.messages(couple_id,sender_id,type,text,metadata)
        values(new.couple_id,new.user_id,'event',description,jsonb_build_object('kind','activity','activity',new.activity));
      insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data)
        select user_id,new.couple_id,'activity:'||extensions.gen_random_uuid(),'Actividad de tu pareja',description,new.activity,jsonb_build_object('screen','Chat')
          from public.couple_members where couple_id=new.couple_id and user_id<>new.user_id;
    end if;
  end if;
  if not (options->>'save_trips')::boolean then return new; end if;
  select * into trip from public.trips where user_id=new.user_id and ended_at is null for update;
  if trip.id is not null and trip.couple_id<>new.couple_id then delete from public.trips where id=trip.id; trip.id:=null; end if;
  if trip.id is not null and trip.last_sample_at>=new.captured_at then return new; end if;
  if trip.id is null then
    if coalesce(new.speed_mps,0)<0.8 then return new; end if;
    insert into public.trips(couple_id,user_id,started_at,last_sample_at,last_moved_at,points,activity)
      values(new.couple_id,new.user_id,new.captured_at,new.captured_at,new.captured_at,
        jsonb_build_array(jsonb_build_object('lat',new.lat,'lng',new.lng,'at',new.captured_at)),new.activity);
    return new;
  end if;
  p:=trip.points->(jsonb_array_length(trip.points)-1);
  meters:=6371000*2*asin(least(1,sqrt(power(sin(radians(new.lat-(p->>'lat')::double precision)/2),2)+
    cos(radians(new.lat))*cos(radians((p->>'lat')::double precision))*power(sin(radians(new.lng-(p->>'lng')::double precision)/2),2))));
  if meters>=greatest(25,new.accuracy_m) and new.captured_at-trip.last_sample_at>=interval '5 seconds' then
    if jsonb_array_length(trip.points)>=2000 then
      select jsonb_agg(point order by ord) into trip.points from jsonb_array_elements(trip.points) with ordinality as t(point,ord)
        where ord%2=1 or ord=jsonb_array_length(trip.points);
    end if;
    update public.trips set points=trip.points||jsonb_build_array(jsonb_build_object('lat',new.lat,'lng',new.lng,'at',new.captured_at)),
      distance_m=distance_m+meters,last_moved_at=new.captured_at,last_sample_at=new.captured_at where id=trip.id;
  else
    update public.trips set last_sample_at=new.captured_at where id=trip.id;
    if coalesce(new.speed_mps,0)<0.8 and new.captured_at-trip.last_moved_at>=interval '3 minutes' then
      perform public.finish_trip(new.user_id,'stationary',new.captured_at);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists process_location_activity on public.locations;
create trigger process_location_activity after update of battery_level,charging,activity,activity_confidence on public.locations
  for each row execute function public.process_location_activity();

create or replace function public.close_trip_on_arrival()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.event_type='enter' then perform public.finish_trip(new.user_id,'arrival',new.created_at); end if;
  return new;
end $$;
drop trigger if exists close_trip_on_arrival on public.geofence_events;
create trigger close_trip_on_arrival after insert on public.geofence_events for each row execute function public.close_trip_on_arrival();
create or replace function public.close_trip_on_pause()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.location_mode='off' or not (new.location_options->>'save_trips')::boolean then
    perform public.finish_trip(new.user_id,'paused',now());
  end if;
  return new;
end $$;
drop trigger if exists close_trip_on_pause on public.user_settings;
create trigger close_trip_on_pause after update on public.user_settings for each row execute function public.close_trip_on_pause();

revoke all on function public.finish_trip(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.process_location_activity() from public;
revoke all on function public.close_trip_on_arrival() from public;
revoke all on function public.close_trip_on_pause() from public;

create or replace function public.get_tracking_config(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.user_settings; deadline timestamptz;
begin
  if auth.uid() is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  select * into s from public.user_settings where user_id=auth.uid();
  if s.user_id is null or s.tracking_device_id is distinct from p_device_id
    or not exists(select 1 from public.devices where id=p_device_id and user_id=auth.uid()) then return null; end if;
  if s.location_mode='balanced' and s.auto_live_enabled then
    select max(expires_at) into deadline from public.map_view_sessions where target_id=auth.uid()
      and couple_id=public.current_couple_id() and public.is_complete_couple(couple_id) and expires_at>now();
  end if;
  return to_jsonb(s)||jsonb_build_object('userId',auth.uid(),'auto_live_until',deadline,
    'trip_active',exists(select 1 from public.trips where user_id=auth.uid() and ended_at is null));
end $$;

-- Preserve existing place monitoring; add a revocation control, not a new grant.
alter table public.user_settings add column if not exists geofence_paused boolean not null default false;
alter table public.user_settings add column if not exists geofence_resume_after timestamptz not null default 'epoch';

drop function if exists public.set_place_sharing(boolean,boolean);
create or replace function public.set_place_sharing(p_enabled boolean, p_pause_location boolean default false, p_expected_user_id uuid default auth.uid())
returns public.user_settings language plpgsql security definer set search_path=public as $$
declare result public.user_settings;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  if p_enabled is null or p_pause_location is null or (p_enabled and p_pause_location) then
    raise exception 'Preferencias incompatibles' using errcode='22023';
  end if;
  insert into public.user_settings(user_id) values(auth.uid()) on conflict do nothing;
  select * into result from public.user_settings where user_id=auth.uid() for update;
  update public.user_settings set geofence_paused=not p_enabled,
    geofence_resume_after=case when p_enabled and result.geofence_paused then clock_timestamp() else geofence_resume_after end,
    updated_at=now() where user_id=auth.uid() returning * into result;
  if p_pause_location then
    result:=public.save_settings('{"location_mode":"off"}'::jsonb,null);
  end if;
  return result;
end $$;
revoke all on function public.set_place_sharing(boolean,boolean,uuid) from public;
revoke all on function public.set_place_sharing(boolean,boolean,uuid) from anon;
grant execute on function public.set_place_sharing(boolean,boolean,uuid) to authenticated;

-- Applies to both old and new arrival RPCs. Lock the same row as the pause
-- transaction so an event either precedes the pause or is rejected after it.
create or replace function public.enforce_place_sharing()
returns trigger language plpgsql security definer set search_path=public as $$
declare preference public.user_settings;
begin
  insert into public.user_settings(user_id) values(new.user_id) on conflict do nothing;
  select * into preference from public.user_settings where user_id=new.user_id for share;
  if preference.user_id is null or preference.geofence_paused or new.created_at<preference.geofence_resume_after then
    raise exception 'Avisos de lugares pausados o evento anterior a la autorización' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.enforce_place_sharing() from public,anon,authenticated;
drop trigger if exists enforce_place_sharing on public.geofence_events;
create trigger enforce_place_sharing before insert on public.geofence_events
for each row execute function public.enforce_place_sharing();

alter table public.user_settings add column if not exists shared_precision text not null default 'precise'
  check (shared_precision in ('precise','approximate'));
alter table public.user_settings add column if not exists approximate_place_events boolean not null default false;
alter table public.location_history add column if not exists approximate boolean not null default false;
alter table public.location_history add column if not exists accuracy_m double precision;

create or replace function public.uses_approximate_sharing(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_settings where user_id=p_user_id and shared_precision='approximate');
$$;
revoke all on function public.uses_approximate_sharing(uuid) from public;
grant execute on function public.uses_approximate_sharing(uuid) to authenticated;

-- Round before any public row, Realtime publication or trip trigger sees it.
create or replace function public.reduce_shared_location()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.sharing and public.uses_approximate_sharing(new.user_id) then
    new.lat:=round(new.lat::numeric,2)::double precision;
    new.lng:=round(new.lng::numeric,2)::double precision;
    -- A 0.01 degree cell has a maximum centre-to-corner distance below 800 m.
    -- Retain a conservative circle, including uncertainty of the original fix.
    new.accuracy_m:=greatest(coalesce(new.accuracy_m,0)+800,2000);
    new.speed_mps:=null;
    new.heading:=null;
  end if;
  return new;
end $$;
revoke all on function public.reduce_shared_location() from public,anon,authenticated;
drop trigger if exists reduce_shared_location on public.locations;
create trigger reduce_shared_location before insert or update of lat,lng,accuracy_m on public.locations
for each row execute function public.reduce_shared_location();

-- Retain a useful history of zones, without retaining precise coordinates.
create or replace function public.suppress_precise_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.uses_approximate_sharing(new.user_id) then
    if tg_table_name='geofence_events' then
      if not exists(select 1 from public.user_settings where user_id=new.user_id and approximate_place_events) then return null; end if;
    else
      new.lat:=round(new.lat::numeric,2)::double precision;
      new.lng:=round(new.lng::numeric,2)::double precision;
      new.approximate:=true;
      select greatest(accuracy_m,2000) into new.accuracy_m from public.locations where user_id=new.user_id;
      new.accuracy_m:=coalesce(new.accuracy_m,2000);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.suppress_precise_history() from public,anon,authenticated;
drop trigger if exists suppress_precise_history on public.location_history;
create trigger suppress_precise_history before insert on public.location_history
for each row execute function public.suppress_precise_history();
drop trigger if exists suppress_precise_place_events on public.geofence_events;
create trigger suppress_precise_place_events before insert on public.geofence_events
for each row execute function public.suppress_precise_history();

drop policy if exists history_precision on public.location_history;
create policy history_precision on public.location_history as restrictive for select to authenticated
  using(user_id=auth.uid() or approximate or not public.uses_approximate_sharing(user_id));
drop policy if exists trip_precision on public.trips;
create policy trip_precision on public.trips as restrictive for select to authenticated
  using(user_id=auth.uid() or not public.uses_approximate_sharing(user_id));

create or replace function public.set_shared_precision(p_precision text)
returns public.user_settings language plpgsql security definer set search_path=public as $$
declare result public.user_settings;
begin
  if auth.uid() is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  if p_precision is null or p_precision not in ('precise','approximate') then
    raise exception 'Precisión no válida' using errcode='22023';
  end if;
  insert into public.user_settings(user_id) values(auth.uid()) on conflict do nothing;
  select * into result from public.user_settings where user_id=auth.uid() for update;
  update public.user_settings set shared_precision=p_precision,updated_at=now()
    where user_id=auth.uid() returning * into result;
  if p_precision='approximate' then
    -- End an in-progress route without publishing its distance or point list.
    update public.trips set ended_at=last_sample_at,end_reason='privacy'
      where user_id=auth.uid() and ended_at is null;
    update public.locations set lat=lat where user_id=auth.uid();
  end if;
  return result;
end $$;
revoke all on function public.set_shared_precision(text) from public;
grant execute on function public.set_shared_precision(text) to authenticated;

create or replace function public.set_approximate_place_events(p_enabled boolean)
returns public.user_settings language plpgsql security definer set search_path=public as $$
declare result public.user_settings;
begin
  if auth.uid() is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'Preferencia no válida' using errcode='22023'; end if;
  insert into public.user_settings(user_id) values(auth.uid()) on conflict do nothing;
  update public.user_settings set approximate_place_events=p_enabled,updated_at=now()
    where user_id=auth.uid() returning * into result;
  return result;
end $$;
revoke all on function public.set_approximate_place_events(boolean) from public;
grant execute on function public.set_approximate_place_events(boolean) to authenticated;

create table if not exists public.media_assets (
  id uuid primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check(purpose in ('memory','chat')),
  kind text not null check(kind in ('image','video','audio')),
  bucket_id text not null check(bucket_id in ('memories','chat-media')),
  object_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check(byte_size>0 and byte_size<=52428800),
  state text not null default 'uploading' check(state in ('uploading','ready')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  published_at timestamptz
);
create index if not exists media_couple on public.media_assets(couple_id);
alter table public.media_assets enable row level security;
revoke all on public.media_assets from anon,authenticated;
grant select on public.media_assets to authenticated;
drop policy if exists media_read on public.media_assets;
create policy media_read on public.media_assets for select to authenticated using(
  couple_id=public.current_couple_id() and public.is_complete_couple(couple_id)
  and (author_id=auth.uid() or (state='ready' and published_at is not null))
);

create table if not exists public.media_deletions (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  object_path text not null,
  author_id uuid not null,
  created_at timestamptz not null default now(),
  unique(bucket_id,object_path)
);
alter table public.media_deletions enable row level security;
revoke all on public.media_deletions from public,anon,authenticated;
create or replace function public.queue_media_deletion()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.media_deletions(bucket_id,object_path,author_id) values(old.bucket_id,old.object_path,old.author_id) on conflict do nothing;
  return old;
end $$;
revoke all on function public.queue_media_deletion() from public,anon,authenticated;
drop trigger if exists queue_media_deletion on public.media_assets;
create trigger queue_media_deletion before delete on public.media_assets for each row execute function public.queue_media_deletion();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('memories','memories',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']),
       ('chat-media','chat-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/mp4','audio/mpeg','audio/aac'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists media_files_upload on storage.objects;
create policy media_files_upload on storage.objects for insert to authenticated with check (
  exists(select 1 from public.media_assets a where a.bucket_id=storage.objects.bucket_id and a.object_path=storage.objects.name
    and a.author_id=auth.uid() and a.state='uploading' and a.expires_at>now())
);
drop policy if exists media_files_read on storage.objects;
create policy media_files_read on storage.objects for select to authenticated using (
  exists(select 1 from public.media_assets a where a.bucket_id=storage.objects.bucket_id and a.object_path=storage.objects.name
    and (a.author_id=auth.uid() or (a.state='ready' and a.published_at is not null)))
);

create or replace function public.reserve_media_upload(p_id uuid,p_purpose text,p_kind text,p_mime text,p_bytes bigint)
returns public.media_assets language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id(); result public.media_assets; bucket text;
begin
  if auth.uid() is null or c is null or not public.is_complete_couple(c) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  if p_id is null or p_purpose is null or p_purpose not in ('memory','chat') or p_kind is null or p_kind not in ('image','video','audio')
    or p_mime is null or p_bytes is null or p_bytes<=0 or p_bytes>52428800
    or (p_kind='image' and (p_mime not in ('image/jpeg','image/png','image/webp') or p_bytes>10485760))
    or (p_kind='video' and p_mime not in ('video/mp4','video/quicktime'))
    or (p_kind='audio' and (p_purpose<>'chat' or p_mime not in ('audio/mp4','audio/mpeg','audio/aac') or p_bytes>10485760)) then
    raise exception 'Archivo no válido o demasiado grande' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,17));
  select * into result from public.media_assets where id=p_id;
  if result.id is not null then
    if result.author_id<>auth.uid() or result.couple_id<>c or result.purpose<>p_purpose or result.kind<>p_kind or result.mime_type<>p_mime or result.byte_size<>p_bytes then
      raise exception 'Identificador de carga ya utilizado' using errcode='22023';
    end if;
    return result;
  end if;
  if coalesce((select sum(byte_size) from public.media_assets where couple_id=c),0)+p_bytes>524288000 then
    raise exception 'Se ha alcanzado el límite compartido de 500 MiB' using errcode='22023';
  end if;
  bucket:=case when p_purpose='memory' then 'memories' else 'chat-media' end;
  if exists(select 1 from public.media_deletions where bucket_id=bucket and object_path=c::text||'/'||auth.uid()::text||'/'||p_id::text) then
    raise exception 'Esta carga fue cancelada; usa un identificador nuevo' using errcode='22023';
  end if;
  insert into public.media_assets(id,couple_id,author_id,purpose,kind,bucket_id,object_path,mime_type,byte_size)
    values(p_id,c,auth.uid(),p_purpose,p_kind,bucket,c::text||'/'||auth.uid()::text||'/'||p_id::text,p_mime,p_bytes)
    returning * into result;
  return result;
end $$;
revoke all on function public.reserve_media_upload(uuid,text,text,text,bigint) from public;
grant execute on function public.reserve_media_upload(uuid,text,text,text,bigint) to authenticated;

create or replace function public.complete_media_upload(p_id uuid)
returns public.media_assets language plpgsql security definer set search_path=public as $$
declare result public.media_assets; info jsonb;
begin
  select * into result from public.media_assets where id=p_id and author_id=auth.uid() and couple_id=public.current_couple_id() for update;
  if result.id is null or not public.is_complete_couple(result.couple_id) then raise exception 'Carga no disponible' using errcode='42501'; end if;
  if result.state='ready' then return result; end if;
  if result.expires_at<=now() then raise exception 'La carga ha caducado' using errcode='22023'; end if;
  select metadata into info from storage.objects where bucket_id=result.bucket_id and name=result.object_path;
  if info is null or (info->>'size')::bigint is distinct from result.byte_size or info->>'mimetype' is distinct from result.mime_type then
    raise exception 'El archivo almacenado no coincide con la carga' using errcode='22023';
  end if;
  update public.media_assets set state='ready' where id=p_id returning * into result;
  return result;
end $$;
revoke all on function public.complete_media_upload(uuid) from public;
grant execute on function public.complete_media_upload(uuid) to authenticated;

create or replace function public.cancel_media_upload(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.media_assets where id=p_id and author_id=auth.uid() and published_at is null;
end $$;
revoke all on function public.cancel_media_upload(uuid) from public;
grant execute on function public.cancel_media_upload(uuid) to authenticated;

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

create or replace function public.send_affection(p_couple_id uuid,p_client_id uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d date:=(now() at time zone 'Europe/Madrid')::date; member public.couple_members; event_id uuid; previous public.messages; symbol text;
begin
  if p_kind is null or p_kind not in ('love','kiss','hug','miss_you') then raise exception 'Gesto no válido' using errcode='22023'; end if;
  select * into member from public.couple_members where couple_id=p_couple_id and user_id=auth.uid() for update;
  if member.user_id is null or not public.is_complete_couple(p_couple_id) or p_client_id is null then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  select * into previous from public.messages where sender_id=auth.uid() and client_id=p_client_id;
  if previous.id is not null then
    if previous.couple_id<>p_couple_id or previous.type<>'love' or coalesce(previous.metadata->>'affection','love')<>p_kind then
      raise exception 'Identificador utilizado para otra acción' using errcode='22023';
    end if;
    return jsonb_build_object('sentNow',false,'sentToday',member.last_love_date=d,'streakCount',member.love_streak_count);
  end if;
  if (select count(*) from public.messages where sender_id=auth.uid() and type='love' and created_at>now()-interval '10 seconds')>=10 then
    raise exception 'Espera unos segundos antes de enviar otro gesto' using errcode='22023';
  end if;
  insert into public.love_events(couple_id,user_id,sent_on) values(p_couple_id,auth.uid(),d)
    on conflict(couple_id,user_id,sent_on) do nothing returning id into event_id;
  if event_id is not null then
    member.love_streak_count:=case when member.last_love_date=d-1 then member.love_streak_count+1 else 1 end;
    update public.couple_members set love_streak_count=member.love_streak_count,last_love_date=d where couple_id=p_couple_id and user_id=auth.uid();
  end if;
  symbol:=case p_kind when 'love' then '❤️ Amor' when 'kiss' then '😘 Beso' when 'hug' then '🫂 Abrazo' else '✨ Te echo de menos' end;
  insert into public.messages(couple_id,sender_id,type,text,client_id,metadata)
    values(p_couple_id,auth.uid(),'love',symbol,p_client_id,jsonb_build_object('affection',p_kind));
  return jsonb_build_object('sentNow',true,'sentToday',true,'streakCount',member.love_streak_count);
end $$;
revoke all on function public.send_affection(uuid,uuid,text) from public;
grant execute on function public.send_affection(uuid,uuid,text) to authenticated;

create or replace function public.queue_message_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.type='event' then return new; end if;
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data)
    select user_id,new.couple_id,'message:'||new.id,case when new.type='love' then 'Un gesto de tu pareja' else 'Nuevo mensaje' end,
      case when new.type='love' then case new.metadata->>'affection' when 'kiss' then 'Te ha enviado un beso 😘'
        when 'hug' then 'Te ha enviado un abrazo 🫂' when 'miss_you' then 'Te echa de menos ✨' else 'Te ha enviado amor ❤️' end else left(new.text,180) end,
      case when new.type='love' then 'love' else 'chat' end,jsonb_build_object('screen','Chat','messageId',new.id)
      from public.couple_members where couple_id=new.couple_id and user_id<>new.sender_id;
  return new;
end $$;

alter table public.profiles add column if not exists status_source text not null default 'legacy';
alter table public.profiles add column if not exists status_expires_at timestamptz;
alter table public.profiles drop constraint if exists profiles_status_text_check;
alter table public.profiles add constraint profiles_status_text_check check(char_length(status_text)<=280);

create or replace function public.project_checkin_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    update public.profiles set status_text='',status_emoji='',status_updated_at=null,status_expires_at=null,status_source='legacy'
      where id=old.user_id and status_source='checkin' and status_updated_at=old.updated_at;
    return old;
  end if;
  update public.profiles set status_text=new.phrase,
    status_emoji=case new.mood when 'happy' then '😊' when 'calm' then '😌' when 'tired' then '😴'
      when 'sad' then '😔' when 'stressed' then '😣' else '🤩' end,
    status_updated_at=new.updated_at,status_expires_at=new.expires_at,status_source='checkin'
    where id=new.user_id;
  return new;
end $$;
revoke all on function public.project_checkin_status() from public,anon,authenticated;
drop trigger if exists project_checkin_status on public.daily_checkins;
create trigger project_checkin_status after insert or update or delete on public.daily_checkins
for each row execute function public.project_checkin_status();

create or replace function public.queue_status_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare c uuid;
begin
  if new.status_source='checkin' or new.status_text='' or (new.status_text=old.status_text and new.status_emoji=old.status_emoji) then return new; end if;
  select couple_id into c from public.couple_members where user_id=new.id;
  if c is null then return new; end if;
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data)
    select user_id,c,'status:'||new.id||':'||new.status_updated_at,'Nuevo estado de tu pareja',new.status_text,'status',jsonb_build_object('screen','Estado')
    from public.couple_members where couple_id=c and user_id<>new.id;
  return new;
end $$;
create or replace function public.set_status(p_text text,p_emoji text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  if p_text is null or p_emoji is null or char_length(p_text)>60 or char_length(p_emoji)>16 then raise exception 'Estado no válido' using errcode='22023'; end if;
  update public.profiles set status_text=trim(p_text),status_emoji=trim(p_emoji),status_source='legacy',
    status_updated_at=case when trim(p_text)='' and trim(p_emoji)='' then null else now() end,
    status_expires_at=now()+interval '24 hours' where id=auth.uid();
end $$;
create or replace function public.clear_daily_checkin(p_checkin_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  update public.daily_checkins set expires_at=least(expires_at,now())
    where id=p_checkin_id and user_id=auth.uid() and couple_id=public.current_couple_id();
end $$;
revoke all on function public.clear_daily_checkin(uuid) from public;
revoke all on function public.clear_daily_checkin(uuid) from anon;
grant execute on function public.clear_daily_checkin(uuid) to authenticated;

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

alter table public.memory_entries add column if not exists featured boolean not null default false;
create index if not exists memory_entries_kind_page on public.memory_entries(couple_id,kind,event_date desc,id desc);
create index if not exists memory_entries_featured_page on public.memory_entries(couple_id,event_date desc,id desc) where featured;
create or replace function public.set_memory_featured(p_id uuid,p_featured boolean,p_couple_id uuid,p_expected_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or p_couple_id is distinct from public.current_couple_id()
    or not public.is_complete_couple(p_couple_id) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  if p_featured is null then raise exception 'Opción no válida' using errcode='22023'; end if;
  update public.memory_entries set featured=p_featured where id=p_id and couple_id=p_couple_id;
  if not found then raise exception 'Recuerdo no disponible' using errcode='42501'; end if;
end $$;
revoke all on function public.set_memory_featured(uuid,boolean,uuid,uuid) from public;
grant execute on function public.set_memory_featured(uuid,boolean,uuid,uuid) to authenticated;

commit;
