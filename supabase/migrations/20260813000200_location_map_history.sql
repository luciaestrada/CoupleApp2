-- Añade el historial necesario para el mapa sin eliminar las ubicaciones actuales.
begin;

create table if not exists public.location_history (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  recorded_at timestamptz not null default now()
);
create index if not exists location_history_couple_user_recorded_idx
  on public.location_history(couple_id, user_id, recorded_at desc);

create or replace function public.publish_location(p_lat double precision, p_lng double precision)
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

create or replace function public.cleanup_location_history()
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

revoke all on table public.location_history from anon, authenticated;
grant select on public.location_history to authenticated;
grant all on table public.location_history to service_role;

alter table public.location_history enable row level security;
drop policy if exists location_history_select_member on public.location_history;
create policy location_history_select_member
  on public.location_history for select to authenticated
  using (public.is_couple_member(couple_id));

revoke all on function public.publish_location(double precision, double precision) from public;
revoke all on function public.cleanup_location_history() from public;
grant execute on function public.publish_location(double precision, double precision) to authenticated;
grant execute on function public.cleanup_location_history() to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'location_history'
  ) then
    alter publication supabase_realtime add table public.location_history;
  end if;
end;
$$;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname = 'coupleapp-clean-location-history'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'coupleapp-clean-location-history',
  '25 3 * * *',
  'select public.cleanup_location_history();'
);

notify pgrst, 'reload schema';
commit;
