-- ============================================================================
-- Greek Ties Mobile App — Migration: Push Notification Device Tokens
-- ============================================================================
-- Backs lib/notifications.ts (token registration) and the send-push Edge
-- Function (supabase/functions/send-push/ — reads this table with the
-- service-role key, which bypasses RLS by design).
--
--   • device_tokens — one row per (user, device): the Expo push token that
--     the exp.host push API delivers to. A user has one row per device;
--     re-registering the same device is an upsert (updated_at refresh).
--     Tokens are removed at sign-out by the app and reaped by the Edge
--     Function when Expo reports DeviceNotRegistered.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query (after app-v2-*.sql).
-- Safe to re-run: create-if-not-exists + drop-then-create throughout.
-- ============================================================================

-- ── DEVICE TOKENS ────────────────────────────────────────────────────────────
create table if not exists device_tokens (
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,                       -- ExponentPushToken[...]
  platform    text,                                -- 'ios' | 'android'
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  primary key (user_id, token)
);
-- The Edge Function looks tokens up by recipient user id — covered by the PK
-- prefix, so no extra index is needed.

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Owner-only, full stop. Nobody reads another user's tokens through the API:
-- a leaked token would let a stranger push arbitrary notifications (including
-- crafted deep links) to that user's device. The send-push Edge Function uses
-- the service-role key and is unaffected by these policies.
alter table device_tokens enable row level security;

drop policy if exists "Users manage own device tokens" on device_tokens;
create policy "Users manage own device tokens"
  on device_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- ACCEPTANCE TESTS (run after applying):
--   1. As user A: insert into device_tokens (user_id, token, platform)
--      values (auth.uid(), 'ExponentPushToken[test]', 'ios'); → succeeds.
--      The same insert with user_id = '<user B>' → MUST fail RLS.
--   2. As user A: select * from device_tokens; → only A's own rows, even if
--      other users have registered tokens.
--   3. As user A: re-run the insert from (1) as an upsert on
--      (user_id, token) → succeeds (no duplicate-key error), one row total.
--   4. As user B: delete from device_tokens where user_id = '<user A>';
--      → deletes 0 rows.
--   5. Delete user A in Auth → their device_tokens rows disappear (cascade).
-- ============================================================================
