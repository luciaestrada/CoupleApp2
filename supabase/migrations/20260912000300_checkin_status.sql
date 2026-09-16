begin;
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
commit;
