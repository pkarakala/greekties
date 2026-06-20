# Chats — Group Channels

Discord-structured, Instagram-polished group chat. The GroupMe replacement and a
core feature. See `../../../../greek-ties-app-docs/docs/CHAT_ARCHITECTURE.md`.

## Files

- `_layout.tsx` — nested Stack inside the Chats tab (list → thread).
- `index.tsx` — the **channel list**, grouped into sections (CHANNELS / EXEC / ALUMNI),
  each row showing the last activity time, a message preview, and a gold **unread dot**.
  Sorted by most-recent activity. Refreshes on focus.
- `[channelId].tsx` — the **channel thread**: grouped message bubbles (yours right-aligned
  gold, others left on `surfaceElevated`), avatar + name + grad year above each cluster,
  tap a sender → their Profile, composer with haptic send, auto-scroll to bottom.

## Data & logic (in `lib/`)

- `lib/chat.ts`
  - `useChannels(chapterId, userId)` — loads visible channels (RLS-filtered), each
    channel's latest message for the preview, and computes unread vs. local last-read.
  - `useChannelThread(channelId, userId)` — loads channel + messages + sender profiles,
    subscribes to **Supabase Realtime** INSERTs (`room:<channelId>`), and exposes `send()`
    (insert; appended locally, deduped by id so the realtime echo doesn't double-post).
- `lib/reads.ts` — per-channel "last read" timestamps in `expo-secure-store` (V1 unread).
- `lib/time.ts` — `timeAgoShort` (list) and `clockTime` (bubbles).

## Security — RLS does the gating

Channel visibility is enforced in the **database**, not the UI. The `channels` SELECT
policy hides `alumni_only` channels from non-alumni and `exec_only` from non-members, and
`channel_messages` reads inherit that via the channels subquery. Even a raw API call can't
read an alumni-only channel as an active member. Migration: `supabase/migrations/app-v1-chat.sql`.

## Before this works

1. Run `supabase/migrations/app-v1-chat.sql` then `app-v1-seed-channels.sql`.
2. Enable Realtime on `channel_messages` (Database → Replication → `supabase_realtime`).
3. RLS test: log in as an active member → no `alumni` channel; as an alum → it appears.

## Deferred to Phase 2 of the product

Polls, events, file sharing, reactions, and read receipts. V1 is text-only.
Admin channel creation/management lives in the Admin tab (Phase 6).
