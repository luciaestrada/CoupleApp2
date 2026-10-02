begin;
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
