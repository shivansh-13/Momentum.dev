-- Enable cron extension before running this file in your Supabase database.
create extension if not exists pg_cron;

select cron.schedule(
  'momentum-daily-rollup',
  '*/15 * * * *',
  $$
    insert into public.audit_log(action, meta)
    values ('cron.daily_rollup.tick', jsonb_build_object('at', now()));
  $$
);

select cron.schedule(
  'momentum-trust-recompute',
  '0 2 * * *',
  $$
    insert into public.audit_log(action, meta)
    values ('cron.trust_recompute.tick', jsonb_build_object('at', now()));
  $$
);

select cron.schedule(
  'momentum-notifications-dispatch',
  '* * * * *',
  $$
    update public.notifications
    set status = 'sent', sent_at = now()
    where status = 'pending' and scheduled_for <= now() and channel = 'inapp';
  $$
);
