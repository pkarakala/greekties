-- Server-owned account deletion. DRAFT: applied only to disposable local QA.
-- Requires the existing avatars migration and delete-account Edge Function.
-- Historical migrations remain unchanged. See docs/ACCOUNT_DELETION_ROLLOUT.md.
begin;
create schema account_deletion;
revoke all on schema account_deletion from public, anon, authenticated;
create table account_deletion.requests (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
-- Deliberately no cascading FK: stale JWT uploads must stay fenced after deletion.
alter table account_deletion.requests enable row level security;
revoke all on account_deletion.requests from public, anon, authenticated;

create function public.begin_account_deletion(target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' or target_user_id is null then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 1414));
  if not exists (select 1 from auth.users where id = target_user_id)
     and not exists (select 1 from account_deletion.requests where user_id = target_user_id) then
    raise exception 'Account not found';
  end if;
  insert into account_deletion.requests(user_id) values (target_user_id)
    on conflict (user_id) do nothing;
end;
$$;
revoke all on function public.begin_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.begin_account_deletion(uuid) to service_role;

-- Coordinate every avatar metadata INSERT/UPDATE, including upsert/move and
-- signed/service uploads, with the permanent deletion fence. Existing RLS still
-- applies. Do not disable Storage's own protection triggers.
create function account_deletion.guard_avatar_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_folder text;
begin
  for owner_folder in
    select distinct folder from unnest(array[
      case when new.bucket_id = 'avatars' then split_part(new.name, '/', 1) end,
      case when tg_op = 'UPDATE' and old.bucket_id = 'avatars' then split_part(old.name, '/', 1) end
    ]) as entries(folder) where folder is not null order by folder
  loop
    perform pg_advisory_xact_lock(hashtextextended(owner_folder, 1414));
    if exists (select 1 from account_deletion.requests where user_id::text = owner_folder) then
      raise exception 'Account deletion in progress; avatar writes are disabled'
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function account_deletion.guard_avatar_write() from public, anon, authenticated;
create trigger account_deletion_avatar_write_fence before insert or update on storage.objects
  for each row execute function account_deletion.guard_avatar_write();

-- Finalize only after actual Storage API cleanup. The verification and app/Auth
-- deletion are one transaction. Any error rolls back all account data changes.
create function public.finish_account_deletion(target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := target_user_id;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' or uid is null then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 1414));
  if not exists (select 1 from account_deletion.requests where user_id = uid) then
    raise exception 'Account cleanup has not started';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'avatars'
             and split_part(name, '/', 1) = uid::text) then
    raise exception 'Avatar cleanup incomplete';
  end if;
  -- Dependency order: children before parents (messages reference
  -- mentorship_requests; channel content before profile/auth rows).

  -- Mentorship messages: ones the user sent, plus every message in threads
  -- the user is a party to (the whole thread goes when the request goes).
  if to_regclass('public.messages') is not null then
    if to_regclass('public.mentorship_requests') is not null then
      execute
        'delete from public.messages
         where sender_id = $1
            or request_id in (
              select id from public.mentorship_requests
              where from_user_id = $1 or to_user_id = $1
            )'
        using uid;
    else
      execute 'delete from public.messages where sender_id = $1' using uid;
    end if;
  end if;

  if to_regclass('public.mentorship_requests') is not null then
    execute
      'delete from public.mentorship_requests where from_user_id = $1 or to_user_id = $1'
      using uid;
  end if;

  if to_regclass('public.channel_messages') is not null then
    execute 'delete from public.channel_messages where sender_id = $1' using uid;
  end if;

  if to_regclass('public.channel_members') is not null then
    execute 'delete from public.channel_members where user_id = $1' using uid;
  end if;

  if to_regclass('public.job_postings') is not null then
    execute 'delete from public.job_postings where posted_by = $1' using uid;
  end if;

  if to_regclass('public.content_reports') is not null then
    execute 'delete from public.content_reports where reporter_id = $1' using uid;
  end if;

  if to_regclass('public.user_blocks') is not null then
    execute 'delete from public.user_blocks where blocker_id = $1 or blocked_id = $1' using uid;
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'delete from public.profiles where user_id = $1' using uid;
  end if;


  delete from auth.users where id = uid;
  update account_deletion.requests set completed_at = coalesce(completed_at, now()) where user_id = uid;
end;
$$;
revoke all on function public.finish_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.finish_account_deletion(uuid) to service_role;

-- Old clients must fail closed: they cannot bypass required server cleanup.
create or replace function public.delete_own_account()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Update Greek Ties to delete your account securely through delete-account'
    using errcode = '42501';
end;
$$;
revoke all on function public.delete_own_account() from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
