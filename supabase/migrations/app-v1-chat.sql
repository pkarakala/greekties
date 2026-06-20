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

alter table channels enable row level security;
alter table channel_messages enable row level security;
alter table channel_members enable row level security;

-- CHANNELS: a member can SELECT a channel if it's in their chapter AND
-- (it's public, OR they're an alum and it's alumni-only, OR they're an
-- explicit member of a private channel).
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

-- CHANNEL MEMBERS: you can see and manage your own membership rows.
create policy "Manage own membership"
  on channel_members for all
  using (user_id = auth.uid());

-- ============================================================================
-- NOTE on the messages SELECT policy:
-- Postgres RLS evaluates the `channels` SELECT policy when the EXISTS subquery
-- reads from `channels`. So "Read messages in visible channels" correctly
-- inherits the alumni-only / exec-only restrictions without duplicating them.
-- Verify after running: log in as an active member and confirm you get zero
-- rows from the alumni channel's messages.
-- ============================================================================
