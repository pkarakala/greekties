-- ============================================================================
-- Greek Ties Mobile App — Migration: In-App Chapter Creation
-- ============================================================================
-- Closes the funnel gap called out in docs/PRODUCTION_ROADMAP.md ("Who creates
-- chapters and the first owner? No code anywhere inserts into chapters").
-- Organic signups with no invite can now found a chapter and become its owner.
--
-- New model:
--   • create_chapter(name, designation, university) — SECURITY DEFINER; the
--     ONLY way app clients create a chapter. Inserts the chapters row AND the
--     caller's owner profile server-side, so the client never chooses
--     status/admin_role. One profile per account, same rule as join_chapter.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query (after app-v2-*.sql).
-- Safe to re-run: create or replace.
-- ============================================================================

-- ── RPC: create_chapter(name, designation, university) → uuid ────────────────
-- Creates the chapter, makes the caller its approved owner, seeds the default
-- channels (when app-v1-chat.sql has been applied), and returns the new
-- chapter's id. Optional params may be passed as '' — normalized to null.
--
-- SECURITY DEFINER + a pinned search_path so the function can write chapters /
-- profiles regardless of the caller's RLS, without being hijackable via
-- schema shadowing.
create or replace function create_chapter(
  chapter_name text,
  chapter_designation text,
  university_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_chapter_id uuid;
  jwt_email text;
  jwt_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create a chapter.';
  end if;

  if chapter_name is null or trim(chapter_name) = '' then
    raise exception 'Please enter a chapter name.';
  end if;

  -- Serialize concurrent create/join calls by the same user (the live
  -- profiles table may not have a unique constraint on user_id, so the exists
  -- check alone could race). Same lock key as join_chapter, so a simultaneous
  -- create_chapter + join_chapter by one user also serializes.
  -- Transaction-scoped: released automatically on commit/rollback.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  -- Single-chapter model: one profiles row per user, ever.
  if exists (select 1 from profiles where user_id = auth.uid()) then
    raise exception 'You already belong to a chapter. Each account can only join one chapter.';
  end if;

  -- Relies on chapters.id / created_at having server-side defaults (standard
  -- on the live table per greek-ties-app-docs). Optional fields arrive as ''
  -- from the app's form — store null instead so filters/display stay clean.
  insert into chapters (name, designation, university, created_by)
  values (
    trim(chapter_name),
    nullif(trim(coalesce(chapter_designation, '')), ''),
    nullif(trim(coalesce(university_name, '')), ''),
    auth.uid()
  )
  returning id into new_chapter_id;

  -- Pull identity from the JWT where available (may be null for some
  -- providers — profile editing fills the gaps later).
  jwt_email := auth.jwt() ->> 'email';
  jwt_name  := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    jwt_email
  );

  -- The founder is the chapter's first owner, approved immediately.
  -- Relies on profiles.id / created_at having server-side defaults.
  insert into profiles (user_id, chapter_id, email, name, status, admin_role)
  values (auth.uid(), new_chapter_id, jwt_email, jwt_name, 'approved', 'owner');

  -- Cold start: seed the default channel set (mirrors app-v1-seed-channels.sql,
  -- which anticipates exactly this per-new-chapter replication). Guarded so
  -- the function still works if app-v1-chat.sql hasn't been applied yet.
  if to_regclass('public.channels') is not null then
    execute
      'insert into channels (chapter_id, name, description, visibility)
       select $1, d.name, d.description, d.visibility
       from (values
         (''general'',      ''Main chapter chat'',     ''all''),
         (''exec'',         ''Executive board'',       ''exec_only''),
         (''housing'',      ''Housing coordination'',  ''all''),
         (''abroad'',       ''Study abroad'',          ''all''),
         (''philanthropy'', ''Philanthropy & events'', ''all''),
         (''alumni'',       ''Alumni-only network'',   ''alumni_only'')
       ) as d(name, description, visibility)
       where not exists (
         select 1 from channels existing where existing.chapter_id = $1
       )'
      using new_chapter_id;
  end if;

  return new_chapter_id;
end;
$$;

-- Supabase's default privileges grant EXECUTE to `anon` individually, so
-- revoking from `public` alone isn't enough — revoke `anon` explicitly.
revoke execute on function create_chapter(text, text, text) from public;
revoke execute on function create_chapter(text, text, text) from anon;
grant execute on function create_chapter(text, text, text) to authenticated;

-- ============================================================================
-- ACCEPTANCE TESTS (run after applying):
--   1. As a fresh signed-up user with no profile:
--      select create_chapter('Alpha Beta Gamma', 'Delta Chapter', 'Test University');
--      → returns a uuid; a chapters row exists with created_by = the caller,
--        and a profiles row exists with status = 'approved', admin_role = 'owner'.
--   2. Call create_chapter again as that user
--      → MUST error "You already belong to a chapter."
--   3. As a user who joined via join_chapter: select create_chapter('X', '', '');
--      → MUST error "You already belong to a chapter."
--   4. Signed out (anon key, no JWT): select create_chapter('X', '', '');
--      → MUST fail (execute revoked from anon).
--   5. select create_chapter('   ', '', ''); as a fresh user
--      → MUST error "Please enter a chapter name."
--   6. If app-v1-chat.sql is applied: the new chapter has the 6 default
--      channels (general/exec/housing/abroad/philanthropy/alumni).
--   7. Optional params: create_chapter('Solo', '', '') stores designation and
--      university as NULL, not ''.
-- ============================================================================
