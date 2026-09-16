begin;
create table if not exists public.media_assets (
  id uuid primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check(purpose in ('memory','chat')),
  kind text not null check(kind in ('image','video','audio')),
  bucket_id text not null check(bucket_id in ('memories','chat-media')),
  object_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check(byte_size>0 and byte_size<=52428800),
  state text not null default 'uploading' check(state in ('uploading','ready')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  published_at timestamptz
);
create index if not exists media_couple on public.media_assets(couple_id);
alter table public.media_assets enable row level security;
revoke all on public.media_assets from anon,authenticated;
grant select on public.media_assets to authenticated;
drop policy if exists media_read on public.media_assets;
create policy media_read on public.media_assets for select to authenticated using(
  couple_id=public.current_couple_id() and public.is_complete_couple(couple_id)
  and (author_id=auth.uid() or (state='ready' and published_at is not null))
);

create table if not exists public.media_deletions (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  object_path text not null,
  author_id uuid not null,
  created_at timestamptz not null default now(),
  unique(bucket_id,object_path)
);
alter table public.media_deletions enable row level security;
revoke all on public.media_deletions from public,anon,authenticated;
create or replace function public.queue_media_deletion()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.media_deletions(bucket_id,object_path,author_id) values(old.bucket_id,old.object_path,old.author_id) on conflict do nothing;
  return old;
end $$;
revoke all on function public.queue_media_deletion() from public,anon,authenticated;
drop trigger if exists queue_media_deletion on public.media_assets;
create trigger queue_media_deletion before delete on public.media_assets for each row execute function public.queue_media_deletion();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('memories','memories',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']),
       ('chat-media','chat-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/mp4','audio/mpeg','audio/aac'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists media_files_upload on storage.objects;
create policy media_files_upload on storage.objects for insert to authenticated with check (
  exists(select 1 from public.media_assets a where a.bucket_id=storage.objects.bucket_id and a.object_path=storage.objects.name
    and a.author_id=auth.uid() and a.state='uploading' and a.expires_at>now())
);
drop policy if exists media_files_read on storage.objects;
create policy media_files_read on storage.objects for select to authenticated using (
  exists(select 1 from public.media_assets a where a.bucket_id=storage.objects.bucket_id and a.object_path=storage.objects.name
    and (a.author_id=auth.uid() or (a.state='ready' and a.published_at is not null)))
);

create or replace function public.reserve_media_upload(p_id uuid,p_purpose text,p_kind text,p_mime text,p_bytes bigint)
returns public.media_assets language plpgsql security definer set search_path=public as $$
declare c uuid:=public.current_couple_id(); result public.media_assets; bucket text;
begin
  if auth.uid() is null or c is null or not public.is_complete_couple(c) then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  if p_id is null or p_purpose is null or p_purpose not in ('memory','chat') or p_kind is null or p_kind not in ('image','video','audio')
    or p_mime is null or p_bytes is null or p_bytes<=0 or p_bytes>52428800
    or (p_kind='image' and (p_mime not in ('image/jpeg','image/png','image/webp') or p_bytes>10485760))
    or (p_kind='video' and p_mime not in ('video/mp4','video/quicktime'))
    or (p_kind='audio' and (p_purpose<>'chat' or p_mime not in ('audio/mp4','audio/mpeg','audio/aac') or p_bytes>10485760)) then
    raise exception 'Archivo no válido o demasiado grande' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,17));
  select * into result from public.media_assets where id=p_id;
  if result.id is not null then
    if result.author_id<>auth.uid() or result.couple_id<>c or result.purpose<>p_purpose or result.kind<>p_kind or result.mime_type<>p_mime or result.byte_size<>p_bytes then
      raise exception 'Identificador de carga ya utilizado' using errcode='22023';
    end if;
    return result;
  end if;
  if coalesce((select sum(byte_size) from public.media_assets where couple_id=c),0)+p_bytes>524288000 then
    raise exception 'Se ha alcanzado el límite compartido de 500 MiB' using errcode='22023';
  end if;
  bucket:=case when p_purpose='memory' then 'memories' else 'chat-media' end;
  if exists(select 1 from public.media_deletions where bucket_id=bucket and object_path=c::text||'/'||auth.uid()::text||'/'||p_id::text) then
    raise exception 'Esta carga fue cancelada; usa un identificador nuevo' using errcode='22023';
  end if;
  insert into public.media_assets(id,couple_id,author_id,purpose,kind,bucket_id,object_path,mime_type,byte_size)
    values(p_id,c,auth.uid(),p_purpose,p_kind,bucket,c::text||'/'||auth.uid()::text||'/'||p_id::text,p_mime,p_bytes)
    returning * into result;
  return result;
end $$;
revoke all on function public.reserve_media_upload(uuid,text,text,text,bigint) from public;
grant execute on function public.reserve_media_upload(uuid,text,text,text,bigint) to authenticated;

create or replace function public.complete_media_upload(p_id uuid)
returns public.media_assets language plpgsql security definer set search_path=public as $$
declare result public.media_assets; info jsonb;
begin
  select * into result from public.media_assets where id=p_id and author_id=auth.uid() and couple_id=public.current_couple_id() for update;
  if result.id is null or not public.is_complete_couple(result.couple_id) then raise exception 'Carga no disponible' using errcode='42501'; end if;
  if result.state='ready' then return result; end if;
  if result.expires_at<=now() then raise exception 'La carga ha caducado' using errcode='22023'; end if;
  select metadata into info from storage.objects where bucket_id=result.bucket_id and name=result.object_path;
  if info is null or (info->>'size')::bigint is distinct from result.byte_size or info->>'mimetype' is distinct from result.mime_type then
    raise exception 'El archivo almacenado no coincide con la carga' using errcode='22023';
  end if;
  update public.media_assets set state='ready' where id=p_id returning * into result;
  return result;
end $$;
revoke all on function public.complete_media_upload(uuid) from public;
grant execute on function public.complete_media_upload(uuid) to authenticated;

create or replace function public.cancel_media_upload(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.media_assets where id=p_id and author_id=auth.uid() and published_at is null;
end $$;
revoke all on function public.cancel_media_upload(uuid) from public;
grant execute on function public.cancel_media_upload(uuid) to authenticated;
commit;
