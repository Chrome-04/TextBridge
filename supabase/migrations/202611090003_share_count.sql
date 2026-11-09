-- Count only shares that become ready after tracking is installed. Earlier
-- payloads may already have been deleted, so there is no historical backfill.
begin;
lock table textbridge_private.shares in share row exclusive mode;

create table textbridge_private.share_stats (
  singleton boolean primary key default true check (singleton),
  total_shares bigint not null default 0 check (total_shares >= 0),
  started_at timestamptz not null default clock_timestamp()
);
alter table textbridge_private.share_stats enable row level security;
revoke all on textbridge_private.share_stats from public, anon, authenticated, service_role;
insert into textbridge_private.share_stats(singleton) values (true);

create function textbridge_private.count_ready_share()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update textbridge_private.share_stats set total_shares = total_shares + 1
    where singleton;
  return new;
end $$;

revoke execute on function textbridge_private.count_ready_share()
  from public, anon, authenticated, service_role;

create trigger count_ready_share after update of state on textbridge_private.shares
  for each row when (old.state = 'pending' and new.state = 'ready')
  execute function textbridge_private.count_ready_share();

create function public.tb_share_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('totalShares', total_shares::text, 'startedAt', started_at)
    from textbridge_private.share_stats where singleton;
$$;
revoke execute on function public.tb_share_stats() from public, anon, authenticated;
grant execute on function public.tb_share_stats() to service_role;

-- Give counter reads their own limits so they cannot consume sharing or
-- comment allowances. Preserve the existing limits for every other action.
create or replace function public.tb_limit(p_client text, p_action text, p_bytes bigint default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  minute bigint := floor(extract(epoch from clock_timestamp())/60);
  global_id text; client_id text; client_max integer; global_max integer;
  c textbridge_private.rate_limits; g textbridge_private.rate_limits;
begin
  if p_client !~ '^[a-f0-9]{64}$' or p_bytes < 0 or p_bytes > 20971520 then
    raise exception 'invalid';
  end if;
  case p_action
    when 'create' then client_max := 5; global_max := 100;
    when 'upload' then client_max := 5; global_max := 100;
    when 'receive' then client_max := 20; global_max := 400;
    when 'download' then client_max := 20; global_max := 400;
    when 'comment-post' then client_max := 3; global_max := 30;
    when 'comment-list' then client_max := 30; global_max := 500;
    when 'stats' then client_max := 30; global_max := 500;
    else raise exception 'invalid';
  end case;
  global_id := p_action||':'||minute||':global';
  client_id := p_action||':'||minute||':'||p_client;
  perform pg_advisory_xact_lock(hashtextextended('rate:'||global_id, 0));
  select * into c from textbridge_private.rate_limits where id = client_id;
  select * into g from textbridge_private.rate_limits where id = global_id;
  if coalesce(c.count,0) >= client_max or coalesce(g.count,0) >= global_max
    or coalesce(c.bytes,0)+p_bytes > 104857600
    or coalesce(g.bytes,0)+p_bytes > 419430400 then return false; end if;
  insert into textbridge_private.rate_limits values
    (client_id, 1, p_bytes, to_timestamp((minute+2)*60)),
    (global_id, 1, p_bytes, to_timestamp((minute+2)*60))
  on conflict (id) do update set
    count = textbridge_private.rate_limits.count+1,
    bytes = textbridge_private.rate_limits.bytes+excluded.bytes;
  return true;
end $$;

commit;
