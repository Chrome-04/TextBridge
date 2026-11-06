-- Keep legacy 30-minute records readable until their original expiry.
-- New reservations accept only 5 or 10 minutes. No existing expiry is changed.
alter table textbridge_private.shares drop constraint shares_duration_check;
alter table textbridge_private.shares add constraint shares_duration_check
  check (duration in ('5 minutes','10 minutes','30 minutes'));

create or replace function public.tb_reserve(p_code text, p_generation uuid, p_kind text,
  p_name text, p_size integer, p_duration text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old textbridge_private.shares; fresh textbridge_private.shares;
begin
  if p_code !~ '^[A-HJ-NP-Z2-9]{6}$' or p_duration not in ('5 minutes','10 minutes')
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
      clock_timestamp()+case when p_duration='5 minutes' then interval '5 minutes' else interval '10 minutes' end)
    returning * into fresh;
  return to_jsonb(fresh);
end $$;

