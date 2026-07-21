-- Ejecutar en el SQL Editor de tu instancia self-hosted de Supabase
-- (https://supabase.pruebahomelab.es -> proyecto default -> SQL Editor)

-- 1. Perfiles de usuario (extiende auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  couple_id uuid,
  push_token text,
  last_lat double precision,
  last_lng double precision,
  last_location_at bigint,
  saved_places jsonb default '[]'::jsonb
);

-- 2. Parejas
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  member_ids uuid[] not null,
  start_date bigint not null,
  streak_count integer not null default 0,
  streak_last_sent_by uuid,
  streak_last_sent_at bigint,
  streak_last_confirmed_day text
);

alter table public.users
  add constraint users_couple_id_fkey foreign key (couple_id) references public.couples(id);

-- 3. Códigos de invitación para emparejar
create table if not exists public.invites (
  code text primary key,
  owner_id uuid not null references auth.users(id),
  created_at bigint not null
);

-- 4. Mensajes de chat (incluye "toques de amor")
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  text text,
  love_tap boolean not null default false,
  created_at bigint not null
);
create index if not exists messages_couple_created_idx on public.messages(couple_id, created_at desc);

-- 5. Estados (frases + emoji, expiran a las 24h)
create table if not exists public.statuses (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  text text not null,
  emoji text,
  created_at bigint not null,
  expires_at bigint not null,
  primary key (couple_id, user_id)
);

-- 6. Historias con fotos (expiran a las 24h)
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  image_url text not null,
  created_at bigint not null,
  expires_at bigint not null
);
create index if not exists stories_couple_expires_idx on public.stories(couple_id, expires_at);

-- 7. Días especiales (cumpleaños, aniversarios...)
create table if not exists public.special_days (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null,
  date text not null,
  recurring boolean not null default true,
  notify_days_before integer not null default 1
);

-- Bucket de Storage para las fotos de historias (crear también desde el dashboard si prefieres)
insert into storage.buckets (id, name, public)
values ('stories', 'stories', true)
on conflict (id) do nothing;

-- =========================================================
-- Row Level Security: solo los dos miembros de una pareja
-- pueden leer/escribir sus propios datos compartidos.
-- =========================================================
alter table public.users enable row level security;
alter table public.couples enable row level security;
alter table public.invites enable row level security;
alter table public.messages enable row level security;
alter table public.statuses enable row level security;
alter table public.stories enable row level security;
alter table public.special_days enable row level security;

create policy "usuarios ven su propio perfil y el de su pareja"
  on public.users for select
  using (
    id = auth.uid()
    or couple_id in (select couple_id from public.users where id = auth.uid())
  );

create policy "usuarios actualizan solo su propio perfil"
  on public.users for update
  using (id = auth.uid());

create policy "usuarios insertan solo su propio perfil"
  on public.users for insert
  with check (id = auth.uid());

create policy "miembros ven su couple"
  on public.couples for select
  using (auth.uid() = any(member_ids));

create policy "miembros actualizan su couple"
  on public.couples for update
  using (auth.uid() = any(member_ids));

create policy "cualquiera autenticado puede crear un couple al emparejarse"
  on public.couples for insert
  with check (auth.uid() = any(member_ids));

create policy "cualquiera autenticado puede crear/leer invites"
  on public.invites for all
  using (true) with check (owner_id = auth.uid());

create policy "miembros leen/escriben mensajes de su couple"
  on public.messages for all
  using (couple_id in (select couple_id from public.users where id = auth.uid()))
  with check (couple_id in (select couple_id from public.users where id = auth.uid()));

create policy "miembros leen/escriben estados de su couple"
  on public.statuses for all
  using (couple_id in (select couple_id from public.users where id = auth.uid()))
  with check (couple_id in (select couple_id from public.users where id = auth.uid()));

create policy "miembros leen/escriben historias de su couple"
  on public.stories for all
  using (couple_id in (select couple_id from public.users where id = auth.uid()))
  with check (couple_id in (select couple_id from public.users where id = auth.uid()));

create policy "miembros leen/escriben special_days de su couple"
  on public.special_days for all
  using (couple_id in (select couple_id from public.users where id = auth.uid()))
  with check (couple_id in (select couple_id from public.users where id = auth.uid()));

-- Habilitar Realtime en las tablas que necesitan actualizaciones en vivo
alter publication supabase_realtime add table public.couples;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.statuses;
alter publication supabase_realtime add table public.stories;
alter publication supabase_realtime add table public.special_days;
alter publication supabase_realtime add table public.users;