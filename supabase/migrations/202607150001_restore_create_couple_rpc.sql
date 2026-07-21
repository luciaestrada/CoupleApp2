-- Restore the RPC used by the pairing screen and refresh PostgREST's schema cache.
-- This migration is safe to run more than once.
create or replace function public.create_couple_with_invite(
  p_start_date date default current_date
)
returns table(new_couple_id uuid, new_invite_code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_couple_id uuid;
  v_invite_code text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if exists (
    select 1
    from public.couple_members
    where user_id = auth.uid()
  ) then
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

revoke all on function public.create_couple_with_invite(date) from public;
grant execute on function public.create_couple_with_invite(date) to authenticated;

-- Ask PostgREST to discover the function immediately instead of waiting for a restart.
notify pgrst, 'reload schema';
