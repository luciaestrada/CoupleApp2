begin;

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

commit;
