-- ============================================================================
-- Greek Ties Mobile App — Migration: Job Board
-- ============================================================================
-- Adds the "Currently Hiring" board. One new table. Only ADDS — safe to run.
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ── JOB POSTINGS ─────────────────────────────────────────────────────────────
create table if not exists job_postings (
  id          uuid primary key default uuid_generate_v4(),
  chapter_id  uuid not null references chapters(id) on delete cascade,
  posted_by   uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  company     text not null,
  location    text,
  industry    text,                    -- for the industry filter
  description text,
  apply_url   text,                    -- external link to apply
  is_open     boolean not null default true,  -- false = filled/closed, hidden from board
  created_at  timestamptz default now()
);
create index if not exists job_postings_chapter_idx
  on job_postings(chapter_id, created_at desc);

-- If the table was created by an earlier version of this file, add the column.
alter table job_postings add column if not exists is_open boolean not null default true;

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table job_postings enable row level security;

-- Members can read jobs posted in their own chapter.
drop policy if exists "Members read chapter jobs" on job_postings;
create policy "Members read chapter jobs"
  on job_postings for select
  using (
    chapter_id in (
      select chapter_id from profiles where user_id = auth.uid()
    )
  );

-- Members can post a job as themselves into their own chapter.
drop policy if exists "Members post jobs" on job_postings;
create policy "Members post jobs"
  on job_postings for insert
  with check (
    posted_by = auth.uid()
    and chapter_id in (
      select chapter_id from profiles where user_id = auth.uid()
    )
  );

-- Posters can edit their own postings. WITH CHECK pins chapter_id AND
-- posted_by to values the caller is allowed to keep — without it, UPDATE only
-- checks the OLD row, so a poster could move their job into another chapter
-- (or hand it to another user) with a crafted UPDATE.
drop policy if exists "Members manage own jobs" on job_postings;
create policy "Members manage own jobs"
  on job_postings for update
  using (posted_by = auth.uid())
  with check (
    posted_by = auth.uid()
    and chapter_id in (
      select chapter_id from profiles where user_id = auth.uid()
    )
  );

-- Chapter admins (owner/manager) can edit any job in their chapter — e.g. to
-- close (is_open = false) a stale posting. Same chapter pin on WITH CHECK.
drop policy if exists "Admins manage chapter jobs" on job_postings;
create policy "Admins manage chapter jobs"
  on job_postings for update
  using (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = job_postings.chapter_id
        and admin_role in ('owner', 'manager')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = job_postings.chapter_id
        and admin_role in ('owner', 'manager')
    )
  );

-- Posters delete their own postings; chapter admins can delete any in-chapter.
drop policy if exists "Members delete own jobs" on job_postings;
create policy "Members delete own jobs"
  on job_postings for delete
  using (posted_by = auth.uid());

drop policy if exists "Admins delete chapter jobs" on job_postings;
create policy "Admins delete chapter jobs"
  on job_postings for delete
  using (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = job_postings.chapter_id
        and admin_role in ('owner', 'manager')
    )
  );
