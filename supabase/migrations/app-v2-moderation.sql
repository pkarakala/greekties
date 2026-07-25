-- ============================================================================
-- Greek Ties Mobile App — Migration: UGC Moderation (report + block)
-- ============================================================================
-- App Store guideline 1.2 compliance: users can report content and block
-- other users. Backs lib/moderation.ts in the app.
--
--   • content_reports — user-filed reports on profiles/messages/jobs.
--   • user_blocks     — per-user block list; the app filters blocked users'
--     content client-side everywhere.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query (after app-v1-*.sql).
-- Safe to re-run: create-if-not-exists + drop-then-create throughout.
-- ============================================================================

-- ── CONTENT REPORTS ──────────────────────────────────────────────────────────
-- target_id is intentionally NOT a foreign key: it can point at a profile, a
-- channel message, a mentorship message, or a job — and must survive the
-- target being deleted so the report trail stays auditable.
create table if not exists content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  chapter_id  uuid references chapters(id) on delete set null,
  target_type text not null
              check (target_type in ('profile', 'channel_message', 'mentorship_message', 'job')),
  target_id   uuid not null,
  reason      text,
  status      text not null default 'open',        -- open | reviewed | dismissed
  created_at  timestamptz default now()
);
create index if not exists content_reports_chapter_idx on content_reports(chapter_id);

alter table content_reports enable row level security;

-- Reporters file reports as themselves and can see what they filed. The
-- chapter_id pin stops a reporter from routing a report into another
-- chapter's admin queue (null is fine — team-only triage).
drop policy if exists "Users file own reports" on content_reports;
create policy "Users file own reports"
  on content_reports for insert
  with check (
    reporter_id = auth.uid()
    and (
      chapter_id is null
      or chapter_id in (
        select chapter_id from profiles where user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users read own reports" on content_reports;
create policy "Users read own reports"
  on content_reports for select
  using (reporter_id = auth.uid());

-- Chapter admins triage reports filed in their chapter.
drop policy if exists "Admins read chapter reports" on content_reports;
create policy "Admins read chapter reports"
  on content_reports for select
  using (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = content_reports.chapter_id
        and admin_role in ('owner', 'manager')
    )
  );

drop policy if exists "Admins update chapter reports" on content_reports;
create policy "Admins update chapter reports"
  on content_reports for update
  using (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = content_reports.chapter_id
        and admin_role in ('owner', 'manager')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = content_reports.chapter_id
        and admin_role in ('owner', 'manager')
    )
  );

-- ── USER BLOCKS ──────────────────────────────────────────────────────────────
create table if not exists user_blocks (
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

alter table user_blocks enable row level security;

-- You manage only your own block list. WITH CHECK stops inserting/moving rows
-- under someone else's blocker_id.
drop policy if exists "Manage own blocks" on user_blocks;
create policy "Manage own blocks"
  on user_blocks for all
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

-- ============================================================================
-- ACCEPTANCE TESTS (run after applying):
--   1. As user A: insert a report with reporter_id = A → succeeds; with
--      reporter_id = B → MUST fail RLS.
--   2. As user A (member of chapter X): insert a report with chapter_id =
--      '<chapter Y>' → MUST fail RLS; chapter_id = X or null → succeeds.
--   3. As a non-admin: select * from content_reports; → only your own rows.
--   4. As user A: insert into user_blocks (blocker_id, blocked_id) values
--      (B, A); → MUST fail RLS. (A, B) → succeeds.
-- ============================================================================
