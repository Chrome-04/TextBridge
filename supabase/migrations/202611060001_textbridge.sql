-- TextBridge: browsers have no direct access. Only the backend's secret role
-- can call these RPCs. Payloads live in a private Storage bucket.
create schema if not exists textbridge_private;
revoke all on schema textbridge_private from public, anon, authenticated;
grant usage on schema textbridge_private to service_role;

create table textbridge_private.shares (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  generation uuid not null unique,
  kind text not null check (kind in ('text','file')),
  name text not null default '',
  size integer not null check (size between 0 and 20971520),
  duration text not null check (duration in ('10 minutes','30 minutes')),
  state text not null default 'pending' check (state in ('pending','ready')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (kind <> 'file' or (size < 20000000 and length(name) between 1 and 240))
);
create table textbridge_private.garbage (generation uuid primary key);
create table textbridge_private.rate_limits (
  id text primary key, count integer not null, bytes bigint not null,
  expires_at timestamptz not null
);
create table textbridge_private.comments (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (length(btrim(nickname)) between 1 and 40),
  comment text not null check (length(btrim(comment)) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index on textbridge_private.shares (expires_at);
create index on textbridge_private.comments (created_at desc, id desc);
alter table textbridge_private.shares enable row level security;
alter table textbridge_private.garbage enable row level security;
alter table textbridge_private.rate_limits enable row level security;
alter table textbridge_private.comments enable row level security;
revoke all on all tables in schema textbridge_private from public, anon, authenticated;
grant all on all tables in schema textbridge_private to service_role;

create function public.tb_limit(p_client text, p_action text, p_bytes bigint default 0)
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

create function public.tb_reserve(p_code text, p_generation uuid, p_kind text,
  p_name text, p_size integer, p_duration text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old textbridge_private.shares; fresh textbridge_private.shares;
begin
  if p_code !~ '^[A-HJ-NP-Z2-9]{6}$' or p_duration not in ('10 minutes','30 minutes')
    or p_kind not in ('text','file') then raise exception 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('code:'||p_code,0));
  select * into old from textbridge_private.shares where code = p_code for update;
  if found then
    if old.expires_at > clock_timestamp() then return null; end if;
    insert into textbridge_private.garbage values (old.generation) on conflict do nothing;
    delete from textbridge_private.shares where code = p_code;
  end if;
  insert into textbridge_private.shares(code,generation,kind,name,size,duration,expires_at)
    values (p_code,p_generation,p_kind,p_name,p_size,p_duration,
      clock_timestamp()+case when p_duration='10 minutes' then interval '10 minutes' else interval '30 minutes' end)
    returning * into fresh;
  return to_jsonb(fresh);
end $$;

create function public.tb_ready(p_code text, p_generation uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update textbridge_private.shares set state='ready'
    where code=p_code and generation=p_generation and expires_at>clock_timestamp();
  return found;
end $$;

create function public.tb_lookup(p_code text)
returns jsonb language sql security definer set search_path = '' as $$
  select to_jsonb(s) from textbridge_private.shares s
    where code=p_code and state='ready' and expires_at>clock_timestamp();
$$;

create function public.tb_comment(p_nickname text, p_comment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item textbridge_private.comments;
begin
  insert into textbridge_private.comments(nickname,comment) values(btrim(p_nickname),btrim(p_comment)) returning * into item;
  return jsonb_build_object('id',item.id,'nickname',item.nickname,'comment',item.comment,'createdAt',floor(extract(epoch from item.created_at)*1000));
end $$;

create function public.tb_comments()
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'comment',comment,'createdAt',floor(extract(epoch from created_at)*1000)) order by created_at desc,id desc),'[]'::jsonb)
  from (select * from textbridge_private.comments order by created_at desc,id desc limit 20) items;
$$;

create function public.tb_cleanup_batch()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  delete from textbridge_private.rate_limits where expires_at<=clock_timestamp();
  select coalesce(jsonb_agg(generation),'[]'::jsonb) into result from (
    select generation from textbridge_private.shares where expires_at<=clock_timestamp()
    union select generation from textbridge_private.garbage limit 100
  ) items;
  return result;
end $$;
create function public.tb_cleanup_done(p_generation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from textbridge_private.shares where generation=p_generation and expires_at<=clock_timestamp();
  delete from textbridge_private.garbage where generation=p_generation;
end $$;

-- Explicit RPC permissions also work when automatic table exposure is disabled.
revoke execute on function public.tb_limit(text,text,bigint), public.tb_reserve(text,uuid,text,text,integer,text),
  public.tb_ready(text,uuid), public.tb_lookup(text), public.tb_comment(text,text),
  public.tb_comments(), public.tb_cleanup_batch(), public.tb_cleanup_done(uuid)
  from public, anon, authenticated;
grant execute on function public.tb_limit(text,text,bigint), public.tb_reserve(text,uuid,text,text,integer,text),
  public.tb_ready(text,uuid), public.tb_lookup(text), public.tb_comment(text,text),
  public.tb_comments(), public.tb_cleanup_batch(), public.tb_cleanup_done(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values ('textbridge','textbridge',false,20971520,array['application/octet-stream'])
  on conflict(id) do nothing;
-- No public object policies: all uploads/downloads pass through the backend.
