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
  created_at  timestamptz default now()
);
create index if not exists job_postings_chapter_idx
  on job_postings(chapter_id, created_at desc);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table job_postings enable row level security;

-- Members can read jobs posted in their own chapter.
create policy "Members read chapter jobs"
  on job_postings for select
  using (
    chapter_id in (
      select chapter_id from profiles where user_id = auth.uid()
    )
  );

-- Members can post a job as themselves into their own chapter.
create policy "Members post jobs"
  on job_postings for insert
  with check (
    posted_by = auth.uid()
    and chapter_id in (
      select chapter_id from profiles where user_id = auth.uid()
    )
  );

-- Members can edit/delete only their own postings.
create policy "Members manage own jobs"
  on job_postings for update
  using (posted_by = auth.uid());

create policy "Members delete own jobs"
  on job_postings for delete
  using (posted_by = auth.uid());
