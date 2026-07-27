-- ============================================================================
-- Greek Ties Mobile App — Migration: In-App Notification Center
-- ============================================================================
-- Durable in-app copies of every push notification. Push alone misses users
-- who deny the OS permission (or use a simulator / Expo Go) — this table is
-- the record they can always read. Backs lib/inbox-notifications.ts and the
-- app/notifications.tsx screen (bell icon on Home).
--
--   • notifications — one row per (recipient, event). Written ONLY by the
--     send-push Edge Function (supabase/functions/send-push/ — service-role
--     key, bypasses RLS). Users read, mark read, and delete their own rows.
--
-- Depends only on auth.users — safe to run independently of the other v-files.
-- Redeploy send-push after applying so new events start landing here.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query.
-- Safe to re-run: create-if-not-exists + drop-then-create throughout.
-- ============================================================================

-- ── NOTIFICATIONS ────────────────────────────────────────────────────────────
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null
              check (type in ('channel_message', 'mentorship_request', 'mentorship_accepted',
                              'mentorship_message', 'event_created', 'report_update')),
  title       text not null,
  body        text,
  url         text,                                -- in-app path ('/inbox/<id>');
                                                   -- the app re-validates before routing
  read        boolean not null default false,
  created_at  timestamptz default now()
);

-- The inbox query: newest-first page of one user's notifications.
create index if not exists notifications_user_created_idx
  on notifications(user_id, created_at desc);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table notifications enable row level security;

-- Users read only their own notifications.
drop policy if exists "Users read own notifications" on notifications;
create policy "Users read own notifications"
  on notifications for select
  using (user_id = auth.uid());

-- NO INSERT POLICY — deliberately. Only the send-push Edge Function writes
-- rows (its service-role key bypasses RLS). A client INSERT path would let
-- any user mint notifications with spoofed titles/bodies and crafted deep
-- links for themselves (or, with a bug, for others). With RLS enabled and no
-- insert policy, every client INSERT is denied.

-- Users mark their own notifications read. WITH CHECK pins user_id so a row
-- can't be re-assigned to another user via UPDATE. RLS can't say "only the
-- read column changed", so the column-level REVOKE/GRANT below limits
-- authenticated UPDATEs to `read` only — same approach as
-- channel_members.last_read_at in app-v1-chat.sql.
drop policy if exists "Users update own notifications" on notifications;
create policy "Users update own notifications"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on notifications from authenticated;
grant update (read) on notifications to authenticated;

-- Users clear their own notifications.
drop policy if exists "Users delete own notifications" on notifications;
create policy "Users delete own notifications"
  on notifications for delete
  using (user_id = auth.uid());

-- ============================================================================
-- ACCEPTANCE TESTS (run after applying):
--   1. As user A: insert into notifications (user_id, type, title)
--      values (auth.uid(), 'channel_message', 'spoof'); → MUST fail RLS
--      (no insert policy — only the service role writes).
--   2. Via service role (SQL editor as postgres / Edge Function): the same
--      insert for user A → succeeds.
--   3. As user A: select * from notifications; → only A's rows, even when
--      other users have rows. As user B: A's rows are invisible.
--   4. As user A: update notifications set read = true where id = '<own row>';
--      → succeeds. update ... set title = 'x' or user_id = '<user B>' →
--      MUST fail with "permission denied" (column grant limits UPDATE to read).
--   5. As user A: update notifications set read = true
--      where id = '<user B''s row>'; → updates 0 rows.
--   6. As user A: delete from notifications where id = '<own row>'; →
--      succeeds. Against user B's row → deletes 0 rows.
--   7. Delete user A in Auth → their notifications rows disappear (cascade).
--   8. insert (service role) with type = 'bogus' → MUST fail the CHECK.
-- ============================================================================
