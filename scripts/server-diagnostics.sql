-- Read-only diagnostics: no user content, credentials or decrypted Vault data.
select 'RPC' as kind, name, to_regprocedure('public.' || signature) is not null as installed
from (values
  ('get_my_couple','get_my_couple()'),
  ('send_message_v2','send_message_v2(text,uuid,uuid,uuid)'),
  ('get_tracking_config','get_tracking_config(uuid)'),
  ('claim_push_deliveries','claim_push_deliveries(integer)'),
  ('claim_story_cleanup','claim_story_cleanup(integer)'),
  ('reserve_story_upload','reserve_story_upload(uuid,uuid,uuid,text,text,bigint)'),
  ('publish_story_upload','publish_story_upload(uuid,uuid,uuid,text)')
) as expected(name, signature);

select 'table' as kind, name, to_regclass('public.' || name) is not null as installed
from (values ('media_assets'),('media_deletions'),('retired_story_paths'),('daily_checkins'),
  ('couple_plans'),('couple_daily_questions'),('memory_entries'),('notification_deliveries')) as expected(name);

select extname, extversion from pg_extension where extname in ('pg_cron','pg_net','supabase_vault');
select to_regclass('cron.job') is not null as cron_available,
       to_regclass('vault.decrypted_secrets') is not null as vault_available;
-- Inspect cron and Vault only when their objects exist. Print names, never values.
do $$ begin
  if to_regclass('cron.job') is not null then
    raise notice 'Cron is installed: inspect push/maintenance schedules in cron.job.';
  end if;
end $$;
