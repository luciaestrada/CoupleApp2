begin;

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

commit;
