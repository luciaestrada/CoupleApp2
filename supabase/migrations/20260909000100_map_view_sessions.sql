begin;

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

commit;
