-- DRAFT: local-only review mitigation. P1 lifecycle guarantee remains unresolved.
-- Historical migrations preserved. Do not deploy as a completed deletion flow.
begin;
create or replace function account_deletion.guard_avatar_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_folder text; owner_id uuid;
begin
  for owner_folder in
    select distinct folder from unnest(array[
      case when new.bucket_id = 'avatars' then split_part(new.name, '/', 1) end,
      case when tg_op = 'UPDATE' and old.bucket_id = 'avatars' then split_part(old.name, '/', 1) end
    ]) as entries(folder) where folder is not null order by folder
  loop
    if owner_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Avatar owner folder must be a canonical UUID' using errcode = '42501';
    end if;
    owner_id := owner_folder::uuid;
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 1414));
    if exists (select 1 from account_deletion.requests where user_id = owner_id) then
      raise exception 'Account deletion in progress; avatar writes are disabled' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function account_deletion.guard_avatar_write() from public, anon, authenticated;

-- A zero-row Storage metadata check cannot establish physical upload settlement.
-- There is deliberately no boolean/time-based/operator bypass for this guard.
create or replace function public.finish_account_deletion(target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' or target_user_id is null then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  raise exception 'Account finalization disabled: upload lifecycle settlement is not established'
    using errcode = '55000';
end;
$$;
revoke all on function public.finish_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.finish_account_deletion(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
