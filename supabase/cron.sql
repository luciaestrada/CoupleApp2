create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'coupleapp-reset-streaks';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

-- 03:05 UTC siempre sucede después de medianoche en Europe/Madrid.
select cron.schedule(
  'coupleapp-reset-streaks',
  '5 3 * * *',
  'select public.reset_broken_streaks();'
);

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'coupleapp-special-date-reminders';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

-- Se comprueba cada hora; la función solo actúa a las 09:00 de Europe/Madrid.
select cron.schedule(
  'coupleapp-special-date-reminders',
  '0 * * * *',
  'select public.queue_special_date_notifications();'
);
