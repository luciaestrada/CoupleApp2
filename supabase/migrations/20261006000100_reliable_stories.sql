begin;

-- Additive upgrade: existing stories retain their IDs, paths and expiry dates.
alter table public.media_assets drop constraint if exists media_assets_purpose_check;
alter table public.media_assets add constraint media_assets_purpose_check check (purpose in ('memory','chat','story'));
alter table public.media_assets drop constraint if exists media_assets_bucket_id_check;
alter table public.media_assets add constraint media_assets_bucket_id_check check (bucket_id in ('memories','chat-media','stories'));
alter table public.stories add column if not exists media_asset_id uuid references public.media_assets(id) on delete restrict;
create unique index if not exists stories_media_asset on public.stories(media_asset_id) where media_asset_id is not null;

-- Tombstones survive successful Storage deletion: delayed uploads/publications
-- must never reuse a path which a worker has already claimed.
create table if not exists public.retired_story_paths (
  object_path text primary key,
  retired_at timestamptz not null default now()
);
alter table public.retired_story_paths enable row level security;
revoke all on public.retired_story_paths from public,anon,authenticated;

create or replace function public.story_path_available(p_path text)
returns boolean language sql stable security definer set search_path=public as $$
  select not exists(select 1 from public.retired_story_paths where object_path=p_path);
$$;
revoke all on function public.story_path_available(text) from public;
grant execute on function public.story_path_available(text) to authenticated;

create or replace function public.reserve_story_upload(p_id uuid,p_couple_id uuid,p_expected_user_id uuid,p_kind text,p_mime text,p_bytes bigint)
returns public.media_assets language plpgsql security definer set search_path=public as $$
declare result public.media_assets; path text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id
    or p_couple_id is distinct from public.current_couple_id() or not public.is_complete_couple(p_couple_id) then
    raise exception 'Pareja no disponible' using errcode='42501';
  end if;
  if p_id is null or p_kind is null or p_mime is null or p_bytes is null or p_bytes<=0
    or not ((p_kind='image' and p_mime='image/jpeg' and p_bytes<=10485760)
      or (p_kind='video' and p_mime in ('video/mp4','video/quicktime') and p_bytes<=52428800)) then
    raise exception 'Archivo no válido' using errcode='22023';
  end if;
  path:=p_couple_id::text||'/'||auth.uid()::text||'/'||p_id::text;
  perform pg_advisory_xact_lock(hashtextextended(path,61));
  if not public.story_path_available(path) then raise exception 'Carga cancelada o caducada' using errcode='22023'; end if;
  select * into result from public.media_assets where id=p_id for update;
  if result.id is not null then
    if result.author_id<>auth.uid() or result.couple_id<>p_couple_id or result.purpose<>'story'
      or result.kind<>p_kind or result.mime_type<>p_mime or result.byte_size<>p_bytes then
      raise exception 'Identificador de carga ya utilizado' using errcode='22023';
    end if;
    return result;
  end if;
  insert into public.media_assets(id,couple_id,author_id,purpose,kind,bucket_id,object_path,mime_type,byte_size)
    values(p_id,p_couple_id,auth.uid(),'story',p_kind,'stories',path,p_mime,p_bytes) returning * into result;
  return result;
end $$;

create or replace function public.get_story_upload(p_id uuid,p_couple_id uuid,p_expected_user_id uuid)
returns public.media_assets language plpgsql security definer set search_path=public as $$
declare result public.media_assets;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id
    or p_couple_id is distinct from public.current_couple_id() or not public.is_complete_couple(p_couple_id) then
    raise exception 'Pareja no disponible' using errcode='42501';
  end if;
  select * into result from public.media_assets where id=p_id and author_id=auth.uid() and couple_id=p_couple_id and purpose='story';
  return result;
end $$;

-- Also guards legacy create_story/create_story_v2. All publishers and cleanup
-- take the same path lock before inspecting references.
create or replace function public.guard_story_publication()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.image_path,61));
  if not public.story_path_available(new.image_path) then raise exception 'Archivo retirado' using errcode='22023'; end if;
  if exists(select 1 from public.media_assets where object_path=new.image_path
    and (id is distinct from new.media_asset_id or author_id<>new.author_id or couple_id<>new.couple_id or purpose<>'story')) then
    raise exception 'Reserva no autorizada' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_story_publication on public.stories;
create trigger guard_story_publication before insert on public.stories for each row execute function public.guard_story_publication();

create or replace function public.publish_story_upload(p_id uuid,p_couple_id uuid,p_expected_user_id uuid,p_caption text)
returns public.stories language plpgsql security definer set search_path=public as $$
declare asset public.media_assets; result public.stories; info jsonb; path text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id
    or p_couple_id is distinct from public.current_couple_id() or not public.is_complete_couple(p_couple_id) then
    raise exception 'Pareja no disponible' using errcode='42501';
  end if;
  if p_caption is null or char_length(p_caption)>1000 then raise exception 'Texto no válido' using errcode='22023'; end if;
  path:=p_couple_id::text||'/'||auth.uid()::text||'/'||p_id::text;
  perform pg_advisory_xact_lock(hashtextextended(path,61));
  select * into asset from public.media_assets where id=p_id and author_id=auth.uid() and couple_id=p_couple_id and purpose='story' for update;
  if asset.id is null or not public.story_path_available(path) then raise exception 'Carga no disponible' using errcode='P0002'; end if;
  select * into result from public.stories where media_asset_id=p_id;
  if result.id is not null then return result; end if;
  if asset.expires_at<=now() or asset.published_at is not null then raise exception 'Carga caducada' using errcode='22023'; end if;
  select metadata into info from storage.objects where bucket_id='stories' and name=asset.object_path;
  if info is null or (info->>'size')::bigint is distinct from asset.byte_size or info->>'mimetype' is distinct from asset.mime_type then
    raise exception 'El archivo almacenado no coincide con la carga' using errcode='22023';
  end if;
  update public.media_assets set state='ready',published_at=now() where id=p_id;
  insert into public.stories(id,couple_id,author_id,image_path,media_type,caption,media_asset_id)
    values(p_id,p_couple_id,auth.uid(),asset.object_path,asset.kind,trim(p_caption),p_id) returning * into result;
  return result;
end $$;

create or replace function public.queue_media_deletion()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.bucket_id='stories' then
    perform pg_advisory_xact_lock(hashtextextended(old.object_path,61));
    insert into public.retired_story_paths(object_path) values(old.object_path) on conflict do nothing;
  end if;
  insert into public.media_deletions(bucket_id,object_path,author_id) values(old.bucket_id,old.object_path,old.author_id) on conflict do nothing;
  return old;
end $$;

create or replace function public.cancel_story_upload(p_id uuid,p_couple_id uuid,p_expected_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare path text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id then raise exception 'Sesión necesaria' using errcode='42501'; end if;
  path:=p_couple_id::text||'/'||auth.uid()::text||'/'||p_id::text;
  perform pg_advisory_xact_lock(hashtextextended(path,61));
  if exists(select 1 from public.media_assets where id=p_id and author_id=auth.uid() and couple_id=p_couple_id and published_at is not null) then
    raise exception 'La historia ya está publicada' using errcode='22023';
  end if;
  insert into public.retired_story_paths(object_path) values(path) on conflict do nothing;
  delete from public.media_assets where id=p_id and author_id=auth.uid() and couple_id=p_couple_id and purpose='story' and published_at is null;
end $$;

create or replace function public.queue_story_deletion()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(old.image_path,61));
  -- Legacy clients may have referenced a single object from several stories.
  if exists(select 1 from public.stories where image_path=old.image_path) then return old; end if;
  insert into public.retired_story_paths(object_path) values(old.image_path) on conflict do nothing;
  insert into public.media_deletions(bucket_id,object_path,author_id) values('stories',old.image_path,old.author_id) on conflict do nothing;
  if old.media_asset_id is not null then delete from public.media_assets where id=old.media_asset_id; end if;
  return old;
end $$;
drop trigger if exists queue_story_deletion on public.stories;
create trigger queue_story_deletion after delete on public.stories for each row execute function public.queue_story_deletion();

create or replace function public.claim_story_cleanup(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public as $$
declare candidate record; removed integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Límite no válido' using errcode='22023'; end if;
  for candidate in select id,image_path from public.stories where expires_at<=now() order by expires_at limit p_limit loop
    perform pg_advisory_xact_lock(hashtextextended(candidate.image_path,61));
    delete from public.stories where id=candidate.id and expires_at<=now();
    if found then removed:=removed+1; end if;
  end loop;
  for candidate in select id,object_path from public.media_assets where purpose='story' and published_at is null and expires_at<=now() order by expires_at limit p_limit loop
    perform pg_advisory_xact_lock(hashtextextended(candidate.object_path,61));
    delete from public.media_assets where id=candidate.id and published_at is null and expires_at<=now();
  end loop;
  for candidate in select o.name from storage.objects o where o.bucket_id='stories' and o.created_at<now()-interval '48 hours'
    and not exists(select 1 from public.stories s where s.image_path=o.name)
    and not exists(select 1 from public.media_assets a where a.object_path=o.name)
    and not exists(select 1 from public.media_deletions d where d.bucket_id='stories' and d.object_path=o.name)
    order by o.created_at limit p_limit loop
    perform pg_advisory_xact_lock(hashtextextended(candidate.name,61));
    if exists(select 1 from public.stories where image_path=candidate.name) or exists(select 1 from public.media_assets where object_path=candidate.name) then continue; end if;
    insert into public.retired_story_paths(object_path) values(candidate.name) on conflict do nothing;
    insert into public.media_deletions(bucket_id,object_path,author_id)
      values('stories',candidate.name,coalesce(public.try_uuid(split_part(candidate.name,'/',2)),'00000000-0000-0000-0000-000000000000'::uuid)) on conflict do nothing;
  end loop;
  return removed;
end $$;

-- Old timestamp paths remain supported. UUID paths require a private reservation.
alter policy story_files_insert_member on storage.objects with check (
  bucket_id='stories' and public.is_complete_couple(public.try_uuid((storage.foldername(name))[1]))
  and public.try_uuid((storage.foldername(name))[2])=auth.uid() and public.story_path_available(name)
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{13}\.(jpg|png|webp|heic|heif|mp4|mov)$'
);
alter policy media_files_upload on storage.objects with check (
  exists(select 1 from public.media_assets a where a.bucket_id=storage.objects.bucket_id and a.object_path=storage.objects.name
    and a.author_id=auth.uid() and a.state='uploading' and a.expires_at>now()
    and (a.purpose<>'story' or public.story_path_available(a.object_path)))
);
-- Prevent a legacy rollback from deleting an already committed publication.
alter policy story_files_delete_own on storage.objects using (
  bucket_id='stories' and public.try_uuid((storage.foldername(name))[2])=auth.uid()
  and not exists(select 1 from public.stories where image_path=storage.objects.name)
  and not exists(select 1 from public.media_assets where object_path=storage.objects.name)
);

revoke all on function public.reserve_story_upload(uuid,uuid,uuid,text,text,bigint) from public;
revoke all on function public.get_story_upload(uuid,uuid,uuid) from public;
revoke all on function public.publish_story_upload(uuid,uuid,uuid,text) from public;
revoke all on function public.cancel_story_upload(uuid,uuid,uuid) from public;
grant execute on function public.reserve_story_upload(uuid,uuid,uuid,text,text,bigint) to authenticated;
grant execute on function public.get_story_upload(uuid,uuid,uuid) to authenticated;
grant execute on function public.publish_story_upload(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.cancel_story_upload(uuid,uuid,uuid) to authenticated;
revoke all on function public.guard_story_publication() from public,anon,authenticated;
revoke all on function public.queue_story_deletion() from public,anon,authenticated;
revoke all on function public.claim_story_cleanup(integer) from public,anon,authenticated;
grant execute on function public.claim_story_cleanup(integer) to service_role;

notify pgrst, 'reload schema';
commit;
