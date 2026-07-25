-- ============================================================================
-- Greek Ties Mobile App — Migration: Group Chat
-- ============================================================================
-- Adds the group chat system: channels, messages, and membership.
-- Safe to run on the existing database — only ADDS tables, never alters
-- existing ones (chapters, profiles, mentorship_requests, messages).
--
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ── CHANNELS ────────────────────────────────────────────────────────────────
-- One row per chat channel. Each channel belongs to a chapter.
-- `visibility` controls who can see it (enforced by RLS below).
create table if not exists channels (
  id          uuid primary key default uuid_generate_v4(),
  chapter_id  uuid not null references chapters(id) on delete cascade,
  name        text not null,                       -- "general", "exec", "alumni"
  description text,
  visibility  text not null default 'all'
              check (visibility in ('all', 'alumni_only', 'exec_only', 'custom')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);
create index if not exists channels_chapter_idx on channels(chapter_id);

-- ── CHANNEL MESSAGES ─────────────────────────────────────────────────────────
-- The actual messages. Separate from the mentorship `messages` table
-- (which is tied to mentorship_requests and has a different shape).
create table if not exists channel_messages (
  id          uuid primary key default uuid_generate_v4(),
  channel_id  uuid not null references channels(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  content     text not null,
  created_at  timestamptz default now()
);
-- Composite index: fast "latest messages in this channel" queries.
create index if not exists channel_messages_channel_idx
  on channel_messages(channel_id, created_at);

-- ── CHANNEL MEMBERS ──────────────────────────────────────────────────────────
-- Explicit membership for private channels (exec_only, custom).
-- Public channels (visibility = 'all') don't need rows here — everyone in
-- the chapter is an implicit member.
create table if not exists channel_members (
  id          uuid primary key default uuid_generate_v4(),
  channel_id  uuid not null references channels(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz default now(),          -- for unread indicators
  joined_at   timestamptz default now(),
  unique(channel_id, user_id)
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- This is what makes alumni-only channels actually private. Without these
-- policies, anyone could read any message. With them, the database itself
-- refuses to return data the user shouldn't see.
-- (Every policy is drop-then-create so this file is safe to re-run.)

alter table channels enable row level security;
alter table channel_messages enable row level security;
alter table channel_members enable row level security;

-- CHANNELS: a member can SELECT a channel if it's in their chapter AND
-- (it's public, OR they're an alum and it's alumni-only, OR they're an
-- explicit member of a private channel).
drop policy if exists "Members see allowed channels" on channels;
create policy "Members see allowed channels"
  on channels for select
  using (
    chapter_id in (
      select chapter_id from profiles where user_id = auth.uid()
    )
    and (
      visibility = 'all'
      or (visibility = 'alumni_only' and exists (
        select 1 from profiles
        where user_id = auth.uid() and role = 'Alumni'
      ))
      or exists (
        select 1 from channel_members
        where channel_id = channels.id and user_id = auth.uid()
      )
    )
  );

-- CHANNELS: only chapter admins (owner/manager) can create/edit channels.
drop policy if exists "Admins manage channels" on channels;
create policy "Admins manage channels"
  on channels for all
  using (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = channels.chapter_id
        and admin_role in ('owner', 'manager')
    )
  );

-- CHANNEL MESSAGES: you can read messages only in channels you can see.
-- Reuses the channels SELECT policy by checking visibility through a join.
--
-- SECURITY ASSUMPTION (load-bearing — read before touching): the EXISTS
-- subquery below reads `channels` as the *calling user*, so Postgres applies
-- the "Members see allowed channels" SELECT policy inside the subquery. A
-- channel the caller can't SELECT produces zero subquery rows → EXISTS is
-- false → the message row is filtered out. This policy therefore inherits the
-- alumni_only / exec_only / cross-chapter restrictions without duplicating
-- them. It breaks if `channels` policies are ever rewritten as SECURITY
-- DEFINER views/functions, or if a permissive SELECT policy is later added to
-- `channels`.
--
-- ACCEPTANCE TEST (run after applying, as an ACTIVE member — role ≠ 'Alumni'):
--   select count(*) from channel_messages
--   where channel_id = '<alumni channel uuid>';  -- MUST return 0
-- and as a member of chapter A:
--   select count(*) from channel_messages
--   where channel_id = '<any chapter-B channel uuid>';  -- MUST return 0
drop policy if exists "Read messages in visible channels" on channel_messages;
create policy "Read messages in visible channels"
  on channel_messages for select
  using (
    exists (
      select 1 from channels c
      where c.id = channel_messages.channel_id
      -- the channels SELECT policy already restricts which channels are
      -- visible; this EXISTS will only succeed for channels the user can see.
    )
  );

-- CHANNEL MESSAGES: you can send a message as yourself, into a channel you
-- can see, and only if you're in that channel's chapter.
--
-- Note the same RLS-inheritance trick applies on INSERT: the `channels` read
-- inside this WITH CHECK runs under the caller's SELECT policy, so a user who
-- can't see a channel (exec_only non-member, alumni_only active, other
-- chapter) also can't write into it — the subquery returns no rows and the
-- insert is rejected. The explicit chapter join is defense-in-depth on top.
-- ACCEPTANCE TEST: as an active member, insert into the alumni channel — it
-- MUST fail with "new row violates row-level security policy".
drop policy if exists "Send messages to visible channels" on channel_messages;
create policy "Send messages to visible channels"
  on channel_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from channels c
      join profiles p on p.user_id = auth.uid()
      where c.id = channel_messages.channel_id
        and c.chapter_id = p.chapter_id
    )
  );

-- CHANNEL MEMBERS: split policies. A single FOR ALL policy keyed on
-- user_id = auth.uid() would double as the INSERT check, letting any member
-- self-add to exec_only/custom channels — that hole is why these are split.
drop policy if exists "Manage own membership" on channel_members;

-- Anyone can see their own membership rows (unread state, joined channels).
drop policy if exists "Read own membership" on channel_members;
create policy "Read own membership"
  on channel_members for select
  using (user_id = auth.uid());

-- Self-join is allowed ONLY into public ('all') channels of your own chapter.
-- Private channels (exec_only / custom / alumni_only) require an admin to add
-- you — see the admin policies below.
drop policy if exists "Join public chapter channels" on channel_members;
create policy "Join public chapter channels"
  on channel_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from channels c
      join profiles p on p.user_id = auth.uid()
      where c.id = channel_members.channel_id
        and c.visibility = 'all'
        and c.chapter_id = p.chapter_id
    )
  );

-- You can always update your own row (last_read_at) and leave a channel.
-- The policy alone would let you rewrite your row's channel_id to a private
-- channel (RLS can't say "unchanged"), so the column-level REVOKE/GRANT below
-- limits authenticated UPDATEs to last_read_at only.
drop policy if exists "Update own membership" on channel_members;
create policy "Update own membership"
  on channel_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on channel_members from authenticated;
grant update (last_read_at) on channel_members to authenticated;

drop policy if exists "Leave channels" on channel_members;
create policy "Leave channels"
  on channel_members for delete
  using (user_id = auth.uid());

-- ADMINS: chapter owners/managers manage any membership in their chapter's
-- channels — this is the only path into private (exec_only/custom) channels.
-- SELECT is included so the admin UI can list who's in a channel before
-- adding/removing them.
drop policy if exists "Admins read channel membership" on channel_members;
create policy "Admins read channel membership"
  on channel_members for select
  using (
    exists (
      select 1 from channels c
      join profiles p on p.user_id = auth.uid()
      where c.id = channel_members.channel_id
        and c.chapter_id = p.chapter_id
        and p.admin_role in ('owner', 'manager')
    )
  );

drop policy if exists "Admins add channel members" on channel_members;
create policy "Admins add channel members"
  on channel_members for insert
  with check (
    exists (
      select 1 from channels c
      join profiles p on p.user_id = auth.uid()
      where c.id = channel_members.channel_id
        and c.chapter_id = p.chapter_id
        and p.admin_role in ('owner', 'manager')
    )
  );

drop policy if exists "Admins remove channel members" on channel_members;
create policy "Admins remove channel members"
  on channel_members for delete
  using (
    exists (
      select 1 from channels c
      join profiles p on p.user_id = auth.uid()
      where c.id = channel_members.channel_id
        and c.chapter_id = p.chapter_id
        and p.admin_role in ('owner', 'manager')
    )
  );

-- ============================================================================
-- NOTE on the messages SELECT policy:
-- Postgres RLS evaluates the `channels` SELECT policy when the EXISTS subquery
-- reads from `channels`. So "Read messages in visible channels" correctly
-- inherits the alumni-only / exec-only restrictions without duplicating them.
-- Verify after running: log in as an active member and confirm you get zero
-- rows from the alumni channel's messages, and that inserting a row into
-- channel_members for the exec channel as a non-admin fails.
-- ============================================================================
