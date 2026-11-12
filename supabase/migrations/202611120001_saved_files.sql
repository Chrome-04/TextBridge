-- Permanent private files are separate from expiring share payloads.
create table textbridge_private.saved_files (
  id uuid primary key,
  owner_id text not null check (length(owner_id) between 10 and 137),
  name text not null check (length(name) between 1 and 240),
  size integer not null check (size between 1 and 20000000),
  state text not null default 'pending' check (state in ('pending', 'ready', 'deleting')),
  created_at timestamptz not null default clock_timestamp()
);
create index saved_files_owner on textbridge_private.saved_files(owner_id, created_at desc, id);
alter table textbridge_private.saved_files enable row level security;
revoke all on textbridge_private.saved_files from public, anon, authenticated;
grant all on textbridge_private.saved_files to service_role;

create function public.tb_files_list(p_owner text, p_offset integer default 0)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'usedBytes', coalesce((select sum(size) from textbridge_private.saved_files where owner_id=p_owner),0),
    'limitBytes',20000000,
    'count',(select count(*) from textbridge_private.saved_files where owner_id=p_owner),
    'files',coalesce((select jsonb_agg(to_jsonb(f) - 'owner_id' order by created_at desc,id) from (
      select * from textbridge_private.saved_files where owner_id=p_owner
      order by created_at desc,id limit 50 offset greatest(0,least(p_offset,20000000))
    ) f),'[]'::jsonb));
$$;
create function public.tb_file_reserve(p_owner text, p_id uuid, p_name text, p_size integer)
returns text language plpgsql security definer set search_path = '' as $$
declare item textbridge_private.saved_files; used bigint;
begin
  if p_owner !~ '^firebase:.{1,128}$' or p_name is null or length(p_name) not between 1 and 240
    or p_size is null or p_size not between 1 and 20000000 then raise exception 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('saved-files:'||p_owner,0));
  select * into item from textbridge_private.saved_files where id=p_id;
  if found then
    if item.owner_id <> p_owner or item.name <> p_name or item.size <> p_size then return 'conflict'; end if;
    return item.state;
  end if;
  select coalesce(sum(size),0) into used from textbridge_private.saved_files where owner_id=p_owner;
  if used+p_size > 20000000 then return 'full'; end if;
  insert into textbridge_private.saved_files(id,owner_id,name,size) values(p_id,p_owner,p_name,p_size);
  return 'reserved';
end $$;
create function public.tb_file_ready(p_owner text, p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update textbridge_private.saved_files set state='ready'
    where id=p_id and owner_id=p_owner and state='pending' and created_at>clock_timestamp()-interval '15 minutes';
  return found;
end $$;
create function public.tb_file_lookup(p_owner text, p_id uuid, p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item textbridge_private.saved_files;
begin
  select * into item from textbridge_private.saved_files where id=p_id and owner_id=p_owner for update;
  if not found then return null; end if;
  if p_delete then
    if item.state='pending' and item.created_at>clock_timestamp()-interval '15 minutes' then
      return to_jsonb(item) - 'owner_id';
    end if;
    update textbridge_private.saved_files set state='deleting' where id=p_id;
    item.state := 'deleting';
  elsif item.state <> 'ready' then return null;
  end if;
  return to_jsonb(item) - 'owner_id';
end $$;
create function public.tb_file_deleted(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from textbridge_private.saved_files where id=p_id and state='deleting';
$$;
create function public.tb_files_cleanup()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ids jsonb;
begin
  with candidates as (
    select id from textbridge_private.saved_files
    where state='deleting' or (state='pending' and created_at<=clock_timestamp()-interval '15 minutes')
    order by created_at limit 50 for update skip locked
  ), marked as (
    update textbridge_private.saved_files set state='deleting' where id in (select id from candidates) returning id
  ) select coalesce(jsonb_agg(id),'[]'::jsonb) into ids from marked;
  return ids;
end $$;
revoke execute on function public.tb_files_list(text,integer),public.tb_file_reserve(text,uuid,text,integer),
 public.tb_file_ready(text,uuid),public.tb_file_lookup(text,uuid,boolean),public.tb_file_deleted(uuid),public.tb_files_cleanup()
 from public,anon,authenticated;
grant execute on function public.tb_files_list(text,integer),public.tb_file_reserve(text,uuid,text,integer),
 public.tb_file_ready(text,uuid),public.tb_file_lookup(text,uuid,boolean),public.tb_file_deleted(uuid),public.tb_files_cleanup()
 to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('textbridge-saved','textbridge-saved',false,20000000,array['application/octet-stream']);
-- No browser Storage policy: every operation is authorized by the API.
