-- ============================================================================
-- Greek Ties Mobile App — Migration: Chat Message Deletion
-- ============================================================================
-- Lets members delete their OWN channel messages, and chapter admins
-- (owner/manager) moderate any message in their chapter's channels. Backs
-- deleteMessage() in lib/chat.ts and the long-press message sheet in the
-- channel thread screen.
--
-- channel_messages previously had NO delete policy (see app-v1-chat.sql:
-- only SELECT + INSERT), so deletes were denied for everyone. This file only
-- ADDS the two DELETE policies below plus the replica-identity change that
-- realtime DELETE events need — it never alters existing tables or policies.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query (after app-v1-chat.sql).
-- Safe to re-run: drop-then-create policies; ALTER ... REPLICA IDENTITY FULL
-- is idempotent (re-running is a no-op).
-- ============================================================================

-- ── DELETE POLICIES ──────────────────────────────────────────────────────────
-- (DELETE policies take USING only — WITH CHECK applies to INSERT/UPDATE, and
-- this migration adds neither. An RLS-denied delete is NOT an error: it
-- silently matches 0 rows, which is why lib/chat.ts detects success via the
-- returned row count rather than the error field.)

-- Members delete their own messages.
drop policy if exists "Delete own messages" on channel_messages;
create policy "Delete own messages"
  on channel_messages for delete
  using (sender_id = auth.uid());

-- Chapter admins (owner/manager) delete any message in their chapter's
-- channels — the in-chat moderation path. The join pins the admin's chapter
-- to the message's channel's chapter, so an owner of chapter A can never
-- touch chapter B's messages. Same join shape as the "Admins add/remove
-- channel members" policies in app-v1-chat.sql.
drop policy if exists "Admins delete chapter channel messages" on channel_messages;
create policy "Admins delete chapter channel messages"
  on channel_messages for delete
  using (
    exists (
      select 1 from channels c
      join profiles p on p.user_id = auth.uid()
      where c.id = channel_messages.channel_id
        and c.chapter_id = p.chapter_id
        and p.admin_role in ('owner', 'manager')
    )
  );

-- ── REALTIME DELETE EVENTS ───────────────────────────────────────────────────
-- The app subscribes to DELETE on channel_messages (lib/chat.ts →
-- useChannelThread) so a deleted message disappears live for everyone in the
-- room. Two server-side requirements:
--
--   1. Publication: the `supabase_realtime` publication must include
--      channel_messages WITH delete ops. channel_messages was added to the
--      publication for INSERTs during initial setup (Dashboard → Database →
--      Replication → supabase_realtime); confirm delete ops are enabled —
--      the Dashboard's "Source" toggle for the publication must include
--      Delete, or via SQL:
--        select pubinsert, pubdelete from pg_publication
--        where pubname = 'supabase_realtime';   -- pubdelete must be true
--
--   2. Replica identity: needed so realtime DELETE payloads carry the old
--      row's id — with the default (pk-only) identity some pipelines emit an
--      empty `old` record, and the client couldn't tell WHICH message to
--      remove. FULL makes the WAL delete record (and therefore payload.old)
--      carry the row's columns. The client still guards a missing
--      payload.old.id and simply ignores such events.
alter table channel_messages replica identity full;

-- ============================================================================
-- ACCEPTANCE TESTS (run after applying):
--   1. As the sender: delete from channel_messages where id = '<own message>';
--      → 1 row deleted.
--   2. As a different non-admin member of the same chapter: delete from
--      channel_messages where id = '<someone else's message>'; → 0 rows
--      deleted (RLS filters the row — no error, nothing removed).
--   3. As an owner/manager of the message's chapter: the same delete →
--      succeeds (the admin moderation path).
--   4. As an owner/manager of chapter A: delete a message in one of chapter
--      B's channels → 0 rows deleted (chapter pin holds).
--   5. select relreplident from pg_class where relname = 'channel_messages';
--      → 'f' (FULL).
--   6. Realtime smoke test: open the same channel on two devices, delete a
--      message on one → the bubble disappears on the other without a refresh.
--      (If it doesn't, re-check requirement 1 — the publication's delete ops.)
-- ============================================================================
