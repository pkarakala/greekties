-- ============================================================================
-- Greek Ties Mobile App — Migration: Chat Emoji Reactions
-- ============================================================================
-- The #1 chat-parity feature vs GroupMe: emoji reactions on channel messages.
-- Backs lib/reactions.ts and the reaction pills in the channel thread screen.
--
--   • message_reactions — one row per (message, user, emoji). A user can add
--     several different emoji to the same message; tapping the same emoji
--     again toggles it off (the app deletes the row on duplicate-key).
--
-- Run in: Supabase Dashboard → SQL Editor → New Query (after app-v1-chat.sql —
-- needs channel_messages). Independent of the other v2/v3 files.
-- Safe to re-run: create-if-not-exists + drop-then-create throughout.
-- ============================================================================

-- ── MESSAGE REACTIONS ────────────────────────────────────────────────────────
create table if not exists message_reactions (
  message_id  uuid not null references channel_messages(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  emoji       text not null check (char_length(emoji) <= 8),
  created_at  timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

-- No extra index needed: the app's only query is `.in('message_id', ids)`,
-- which the primary key's (message_id, ...) prefix already serves.

alter table message_reactions enable row level security;

-- SELECT: you can read reactions only on messages you can see.
--
-- SECURITY ASSUMPTION (load-bearing — same pattern as "Read messages in
-- visible channels" in app-v1-chat.sql): the EXISTS subquery reads
-- `channel_messages` as the *calling user*, so its SELECT policy applies —
-- and that policy in turn inherits the `channels` visibility rules
-- (alumni_only / exec_only / cross-chapter). A message the caller can't
-- SELECT produces zero subquery rows → EXISTS is false → the reaction row is
-- filtered out. This breaks if channel_messages/channels policies are ever
-- rewritten as SECURITY DEFINER views/functions, or if a permissive SELECT
-- policy is later added to either table.
drop policy if exists "Read reactions on visible messages" on message_reactions;
create policy "Read reactions on visible messages"
  on message_reactions for select
  using (
    exists (
      select 1 from channel_messages m
      where m.id = message_reactions.message_id
      -- channel_messages' SELECT policy (which itself defers to channels RLS)
      -- already restricts which messages are visible; this EXISTS only
      -- succeeds for messages the caller can see.
    )
  );

-- INSERT: you react as yourself, and only to messages you can see. The same
-- RLS-inheritance trick applies inside WITH CHECK: a user who can't see the
-- parent message (exec_only non-member, alumni_only active, other chapter)
-- gets zero subquery rows and the insert is rejected.
drop policy if exists "React to visible messages" on message_reactions;
create policy "React to visible messages"
  on message_reactions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from channel_messages m
      where m.id = message_reactions.message_id
    )
  );

-- DELETE: you can only remove your own reactions (the toggle-off path).
drop policy if exists "Remove own reactions" on message_reactions;
create policy "Remove own reactions"
  on message_reactions for delete
  using (user_id = auth.uid());

-- No UPDATE policy on purpose: a reaction is immutable — toggling is
-- insert/delete, so UPDATE is simply denied for everyone.

-- ============================================================================
-- ACCEPTANCE TESTS (run after applying):
--   1. As a member who can see channel C: insert into message_reactions
--      (message_id, user_id, emoji) values ('<message in C>', auth.uid(), '👍');
--      → succeeds. With user_id = '<other user>' → MUST fail RLS.
--   2. As an ACTIVE member (role ≠ 'Alumni'): insert a reaction on a message
--      in the alumni channel → MUST fail RLS. Same for a message in another
--      chapter's channel.
--   3. As a member who can see the message: select * from message_reactions
--      where message_id = '<visible message>'; → returns everyone's rows
--      (counts work). As a user who can't see it → MUST return 0 rows.
--   4. Insert the same (message_id, auth.uid(), '👍') twice → the second MUST
--      fail with a duplicate-key error (the app treats this as toggle-off and
--      deletes the row instead).
--   5. delete from message_reactions where message_id = '<msg>' and
--      user_id = auth.uid() and emoji = '👍'; → succeeds. Deleting another
--      user's row → 0 rows affected.
--   6. Insert with emoji = 'way-too-long-emoji' (> 8 chars) → MUST fail the
--      CHECK constraint.
-- ============================================================================

-- ── REALTIME (live reaction pills — lib/reactions.ts subscribeToReactions) ──
-- DELETE events only carry the columns in the replica identity; the default
-- identity is the primary key of the *old* row, which PostgREST realtime may
-- not expose. FULL makes DELETE payloads include message_id/user_id/emoji so
-- the client can tell which message's pills to refresh. Idempotent: setting
-- the same identity twice is a no-op.
alter table message_reactions replica identity full;

-- Also add the table to the realtime publication (Supabase Dashboard →
-- Database → Publications → supabase_realtime → enable message_reactions),
-- or via SQL — wrapped so re-running doesn't fail on "already member":
--   do $$ begin
--     alter publication supabase_realtime add table message_reactions;
--   exception when duplicate_object then null; end $$;
--
-- NOTE: postgres_changes events respect RLS — a subscriber only receives
-- INSERT/DELETE events for rows their SELECT policy ("Read reactions on
-- visible messages") lets them read, so cross-chapter / exec-only / alumni
-- reactions never leak over the socket.
--
-- ACCEPTANCE (realtime):
--   7. select relreplident from pg_class where relname = 'message_reactions';
--      → MUST return 'f' (full).
--   8. select * from pg_publication_tables where pubname = 'supabase_realtime'
--      and tablename = 'message_reactions'; → MUST return 1 row.
--   9. With two clients on the same visible channel: client A reacts →
--      client B's pill updates without refetch; A un-reacts → pill clears.
--      A client who cannot see the message MUST receive neither event.
-- ============================================================================
