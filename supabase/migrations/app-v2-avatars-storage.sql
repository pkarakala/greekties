-- ============================================================================
-- Greek Ties Mobile App — Migration: Avatars Storage Bucket
-- ============================================================================
-- Creates the `avatars` storage bucket for profile photos. The app uploads to
-- `<user_id>/avatar.jpg` (lib/profile.ts) and reads via public URLs.
--
--   • Public READ — avatar URLs render anywhere without signed URLs.
--   • Owner-scoped WRITE — a user can only touch objects whose first path
--     folder is their own auth.uid(), so nobody can overwrite anyone else's
--     photo.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query.
-- Safe to re-run: on-conflict-do-nothing + drop-then-create policies.
--
-- NOTE: on newer Supabase projects the SQL-editor role may not own
-- storage.objects, and `create policy` fails with "must be owner of table
-- objects". If that happens, recreate these four policies via Dashboard →
-- Storage → avatars → Policies (same expressions, copy them from below).
-- ============================================================================

-- ── BUCKET ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ── OBJECT POLICIES ──────────────────────────────────────────────────────────
-- storage.objects already has RLS enabled on Supabase projects; we only add
-- policies. (storage.foldername(name))[1] is the first path segment — the
-- app always uploads to `<user_id>/avatar.jpg`.

-- Anyone (including signed-out web visitors) can view avatars. The bucket is
-- public so direct CDN URLs work; this policy covers API-path reads too.
drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Users upload only into their own folder.
drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users replace only their own avatar (upsert path of storage.upload()).
drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users delete only their own avatar (e.g. on account deletion).
drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- ACCEPTANCE TESTS (run after applying):
--   1. As user A, upload to `<A's uid>/avatar.jpg` → succeeds.
--   2. As user A, upload to `<B's uid>/avatar.jpg` → MUST fail RLS.
--   3. Open the public URL of A's avatar in a signed-out browser → renders.
-- ============================================================================
