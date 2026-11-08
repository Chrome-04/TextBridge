-- Apply only to the authorized hosted TextBridge project, after migrations.
-- Before running, store two values in Vault using bound SQL parameters:
-- textbridge_cleanup_url: the project's HTTPS /functions/v1/api/cleanup URL
-- textbridge_cleanup_secret: the same private secret used by the Edge Function
-- Never put the secret in this file or in cron.job.command.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists textbridge_private.cleanup_requests (
  request_id bigint primary key,
  requested_at timestamptz not null default clock_timestamp()
);
alter table textbridge_private.cleanup_requests enable row level security;
revoke all on textbridge_private.cleanup_requests from public, anon, authenticated;

create or replace function textbridge_private.request_cleanup()
returns bigint language plpgsql security definer set search_path = '' as $$
declare endpoint text; secret_value text; request_id bigint;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets
    where name = 'textbridge_cleanup_url';
  select decrypted_secret into secret_value from vault.decrypted_secrets
    where name = 'textbridge_cleanup_secret';
  if endpoint is null or endpoint !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/api/cleanup$'
    or secret_value is null or length(secret_value) < 32 then
    raise exception 'TextBridge cleanup configuration is missing or invalid';
  end if;
  -- Responses are retained by pg_net for six hours; keep our references bounded too.
  delete from textbridge_private.cleanup_requests
    where requested_at < clock_timestamp() - interval '6 hours';
  delete from cron.job_run_details where jobid in
    (select jobid from cron.job where jobname = 'textbridge-expired-payloads')
    and end_time < clock_timestamp() - interval '7 days';
  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'X-TextBridge-Cleanup', secret_value),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into request_id;
  insert into textbridge_private.cleanup_requests(request_id) values (request_id);
  return request_id;
end $$;
revoke execute on function textbridge_private.request_cleanup()
  from public, anon, authenticated, service_role;

-- This stores only the function call; the credential stays in Vault.
select cron.schedule('textbridge-expired-payloads', '* * * * *',
  'select textbridge_private.request_cleanup();');
