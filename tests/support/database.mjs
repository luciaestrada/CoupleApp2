import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage; create schema extensions; create schema cron;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create function extensions.gen_random_uuid() returns uuid language sql as $$ select pg_catalog.gen_random_uuid() $$;
      create function extensions.gen_random_bytes(integer) returns bytea language sql as $$ select decode(substr(md5(random()::text),1,$1*2),'hex') $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,created_at timestamptz not null default now());
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
      create table cron.job(jobid bigserial,jobname text);
      create function cron.unschedule(bigint) returns boolean language sql as $$ select true $$;
      create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
      create publication supabase_realtime;
    `);
  return db;
}
export async function installDatabase(db) {
  const sql = (
    await readFile(new URL('../../supabase/setup.sql', import.meta.url), 'utf8')
  ).replace(/^create extension[^;]+;\s*/gm, '');
  await db.exec(sql);
}
