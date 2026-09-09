begin;

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
commit;
