-- ============================================================================
-- Greek Ties Mobile App — Migration: Account Deletion
-- ============================================================================
-- App Store guideline 5.1.1(v): users must be able to delete their account
-- in-app. delete_own_account() removes the caller's rows from every app table
-- that exists, then the auth user itself.
--
-- IMPORTANT — auth.users privileges: the final `delete from auth.users` only
-- works if the function OWNER can write to the auth schema. Running this file
-- in the Supabase SQL Editor makes `postgres` the owner, which has that
-- privilege on standard Supabase projects. If your project restricts writes
-- to `auth.users` (the delete raises "permission denied"), skip that step
-- here and use the companion Edge Function instead:
-- supabase/functions/delete-account/index.ts (service-role key, same cleanup).
--
-- Run in: Supabase Dashboard → SQL Editor → New Query (after app-v2-moderation).
-- Safe to re-run: create or replace.
-- ============================================================================

-- Every app-table delete is guarded with to_regclass() so the function works
-- even on databases where some migrations haven't been applied yet, and uses
-- EXECUTE so the function still compiles when a table is missing.
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'You must be signed in to delete your account.';
  end if;

  -- Dependency order: children before parents (messages reference
  -- mentorship_requests; channel content before profile/auth rows).

  -- Mentorship messages: ones the user sent, plus every message in threads
  -- the user is a party to (the whole thread goes when the request goes).
  if to_regclass('public.messages') is not null then
    if to_regclass('public.mentorship_requests') is not null then
      execute
        'delete from messages
         where sender_id = $1
            or request_id in (
              select id from mentorship_requests
              where from_user_id = $1 or to_user_id = $1
            )'
        using uid;
    else
      execute 'delete from messages where sender_id = $1' using uid;
    end if;
  end if;

  if to_regclass('public.mentorship_requests') is not null then
    execute
      'delete from mentorship_requests where from_user_id = $1 or to_user_id = $1'
      using uid;
  end if;

  if to_regclass('public.channel_messages') is not null then
    execute 'delete from channel_messages where sender_id = $1' using uid;
  end if;

  if to_regclass('public.channel_members') is not null then
    execute 'delete from channel_members where user_id = $1' using uid;
  end if;

  if to_regclass('public.job_postings') is not null then
    execute 'delete from job_postings where posted_by = $1' using uid;
  end if;

  if to_regclass('public.content_reports') is not null then
    execute 'delete from content_reports where reporter_id = $1' using uid;
  end if;

  if to_regclass('public.user_blocks') is not null then
    execute 'delete from user_blocks where blocker_id = $1 or blocked_id = $1' using uid;
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'delete from profiles where user_id = $1' using uid;
  end if;

  -- Avatar file (best-effort; bucket may not exist yet, and on newer Supabase
  -- projects the function owner may lack delete rights on storage.objects —
  -- neither should abort the whole deletion). Deleting the storage.objects row
  -- makes the avatar unreachable immediately; the backing file may linger
  -- until Storage GC — the Edge Function path deletes it via the Storage API,
  -- which is cleaner.
  if to_regclass('storage.objects') is not null then
    begin
      execute
        'delete from storage.objects
         where bucket_id = ''avatars'' and (storage.foldername(name))[1] = $1::text'
        using uid;
    exception when insufficient_privilege then
      raise notice 'delete_own_account: skipped avatar cleanup (no storage.objects privilege)';
    end;
  end if;

  -- Finally the auth user. Requires the function owner to have delete rights
  -- on auth.users (see header). Remaining FKs that reference auth.users with
  -- ON DELETE CASCADE/SET NULL (e.g. chapter_invites.created_by,
  -- channels.created_by) are handled by the FK actions themselves.
  delete from auth.users where id = uid;
end;
$$;

-- Supabase's default privileges grant EXECUTE to `anon` individually, so
-- revoking from `public` alone isn't enough — revoke `anon` explicitly.
revoke execute on function delete_own_account() from public;
revoke execute on function delete_own_account() from anon;
grant execute on function delete_own_account() to authenticated;

-- ============================================================================
-- ACCEPTANCE TEST (staging only — this is destructive):
--   1. Create a throwaway user, join a chapter, send a channel message.
--   2. As that user: select delete_own_account();
--   3. Verify their profiles / channel_messages rows are gone AND the user no
--      longer appears in Authentication → Users.
--   4. If step 2 raised "permission denied for table users", deploy the Edge
--      Function fallback and have the app call that instead.
-- ============================================================================
