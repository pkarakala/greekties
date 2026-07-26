-- ============================================================================
-- Greek Ties Mobile App — Migration: Event Calendar
-- ============================================================================
-- The flagship V2 feature (docs/PRODUCTION_ROADMAP.md → Phase E): a
-- chapter-scoped event calendar with RSVPs. Backs lib/events.ts in the app.
--
--   • events      — chapter events (chapter/alumni/philanthropy/social/
--     recruitment), created by any approved member.
--   • event_rsvps — one row per (event, user): going / maybe / declined.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query (after app-v2-*.sql).
-- Safe to re-run: create-if-not-exists + drop-then-create throughout.
-- ============================================================================

-- ── EVENTS ───────────────────────────────────────────────────────────────────
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null references chapters(id) on delete cascade,
  created_by  uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  description text,
  location    text,
  category    text not null
              check (category in ('chapter', 'alumni', 'philanthropy', 'social', 'recruitment')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,                       -- null = no explicit end time
  created_at  timestamptz default now()
);

-- The agenda query: upcoming events for one chapter, ordered by start time.
create index if not exists events_chapter_starts_idx on events(chapter_id, starts_at);

alter table events enable row level security;

-- Members read their own chapter's events.
drop policy if exists "Members read chapter events" on events;
create policy "Members read chapter events"
  on events for select
  using (
    chapter_id in (
      select chapter_id from profiles where user_id = auth.uid()
    )
  );

-- Any member can create an event, as themselves, in their own chapter. The
-- WITH CHECK pins both columns so a client can never plant events in another
-- chapter or attribute them to another user.
drop policy if exists "Members create chapter events" on events;
create policy "Members create chapter events"
  on events for insert
  with check (
    created_by = auth.uid()
    and chapter_id in (
      select chapter_id from profiles where user_id = auth.uid()
    )
  );

-- Creators edit their own events. WITH CHECK pins chapter_id AND created_by —
-- without it, UPDATE only checks the OLD row, so a creator could move their
-- event into another chapter (or hand it to another user) with a crafted
-- UPDATE. Same rationale as job_postings in app-v1-jobs.sql.
drop policy if exists "Creators update own events" on events;
create policy "Creators update own events"
  on events for update
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and chapter_id in (
      select chapter_id from profiles where user_id = auth.uid()
    )
  );

-- Chapter admins (owner/manager) can edit any event in their chapter.
-- Same chapter pin on WITH CHECK.
drop policy if exists "Admins update chapter events" on events;
create policy "Admins update chapter events"
  on events for update
  using (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = events.chapter_id
        and admin_role in ('owner', 'manager')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = events.chapter_id
        and admin_role in ('owner', 'manager')
    )
  );

-- Creators delete their own events; chapter admins can delete any in-chapter.
drop policy if exists "Creators delete own events" on events;
create policy "Creators delete own events"
  on events for delete
  using (created_by = auth.uid());

drop policy if exists "Admins delete chapter events" on events;
create policy "Admins delete chapter events"
  on events for delete
  using (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = events.chapter_id
        and admin_role in ('owner', 'manager')
    )
  );

-- ── EVENT RSVPS ──────────────────────────────────────────────────────────────
create table if not exists event_rsvps (
  event_id    uuid not null references events(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null check (status in ('going', 'maybe', 'declined')),
  created_at  timestamptz default now(),
  primary key (event_id, user_id)
);

alter table event_rsvps enable row level security;

-- Members see who's going to their chapter's events (the app shows going /
-- maybe counts). The events subquery is itself RLS-guarded, but pin the
-- chapter membership explicitly so this policy stands on its own.
drop policy if exists "Members read chapter RSVPs" on event_rsvps;
create policy "Members read chapter RSVPs"
  on event_rsvps for select
  using (
    exists (
      select 1 from events e
      where e.id = event_rsvps.event_id
        and e.chapter_id in (
          select chapter_id from profiles where user_id = auth.uid()
        )
    )
  );

-- Users manage only their OWN RSVP rows, and only for events in their own
-- chapter. USING covers update/delete of existing rows; WITH CHECK stops
-- inserting/moving rows under someone else's user_id or RSVPing to another
-- chapter's events.
drop policy if exists "Users manage own RSVPs" on event_rsvps;
create policy "Users manage own RSVPs"
  on event_rsvps for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from events e
      where e.id = event_rsvps.event_id
        and e.chapter_id in (
          select chapter_id from profiles where user_id = auth.uid()
        )
    )
  );

-- ============================================================================
-- ACCEPTANCE TESTS (run after applying):
--   1. As a member of chapter X: insert an event with chapter_id = X and
--      created_by = auth.uid() → succeeds. With chapter_id = '<chapter Y>' or
--      created_by = '<other user>' → MUST fail RLS.
--   2. As a member of chapter Y: select * from events where chapter_id =
--      '<chapter X>'; → MUST return 0 rows.
--   3. As the event creator: update events set chapter_id = '<chapter Y>'
--      where id = '<their event>'; → MUST fail RLS (the WITH CHECK pin).
--      Updating title/starts_at in place succeeds.
--   4. As a non-creator, non-admin member: update/delete on someone else's
--      event → MUST fail RLS. As an owner/manager of that chapter → succeeds.
--   5. As user A: insert into event_rsvps (event_id, user_id, status) values
--      ('<chapter event>', '<user B>', 'going'); → MUST fail RLS.
--      (…, auth.uid(), 'going') → succeeds; re-upserting to 'maybe' succeeds.
--   6. As user A: RSVP to an event in a chapter A doesn't belong to → MUST
--      fail RLS.
--   7. As a member of the event's chapter: select * from event_rsvps where
--      event_id = '<chapter event>'; → returns everyone's rows (counts work).
--      As a member of another chapter → 0 rows.
-- ============================================================================
