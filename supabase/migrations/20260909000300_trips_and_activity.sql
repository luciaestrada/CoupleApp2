begin;
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
commit;
