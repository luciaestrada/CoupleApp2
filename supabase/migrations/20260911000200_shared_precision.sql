begin;
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
commit;
