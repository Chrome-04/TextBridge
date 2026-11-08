-- Owner-only operational checks. Run in the Supabase SQL Editor after deployment.
-- A successful cron run only queues HTTP; inspect the HTTP status as well.
select j.active, d.start_time, d.status as scheduler_status
from cron.job j
left join lateral (
  select start_time, status from cron.job_run_details
  where jobid = j.jobid order by start_time desc limit 1
) d on true
where j.jobname = 'textbridge-expired-payloads';

select q.requested_at, r.status_code, r.timed_out,
  case
    when r.status_code = 200 then 'ok'
    when r.id is not null then 'failed'
    when q.requested_at < clock_timestamp() - interval '3 minutes' then 'no response'
    else 'waiting'
  end as cleanup_status
from textbridge_private.cleanup_requests q
left join net._http_response r on r.id = q.request_id
order by q.requested_at desc limit 10;

select
  (select count(*) from textbridge_private.shares
    where expires_at <= clock_timestamp()) as expired_payloads,
  (select count(*) from textbridge_private.garbage) as orphaned_payloads,
  (select min(expires_at) from textbridge_private.shares
    where expires_at <= clock_timestamp()) as oldest_expired_at;

-- Investigate an inactive/missing job, failed HTTP responses, or a growing backlog.
-- The cleanup requester prunes only this job's history older than seven days.
