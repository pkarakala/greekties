# Supabase Migrations — Greek Ties App

New tables, functions, and storage the mobile app needs. These **only ADD** objects — they never alter the existing live tables (`chapters`, `profiles`, `mentorship_requests`, `messages`), so they're safe to run against the production database. Every file is idempotent (`create ... if not exists` / `drop policy if exists` / `create or replace`), so re-running one is harmless.

## Run order

Run these in the Supabase SQL Editor in this exact order:

1. **`app-v1-chat.sql`** — creates `channels`, `channel_messages`, `channel_members` + RLS policies (split membership policies: self-join only into public channels; admins manage private-channel membership).
2. **`app-v1-jobs.sql`** — creates `job_postings` (with `is_open`) + RLS policies (poster + chapter-admin update/delete, chapter pinned via `WITH CHECK`).
3. **`app-v1-seed-channels.sql`** — seeds the 6 default channels for every existing chapter. Run AFTER #1.
4. **`app-v2-invites.sql`** — creates `chapter_invites` + the `join_chapter(code)` and `create_chapter_invite(chapter_id)` SECURITY DEFINER RPCs. Replaces the "invite code = chapter UUID" flow.
5. **`app-v2-moderation.sql`** — creates `content_reports` + `user_blocks` (report/block, App Store guideline 1.2).
6. **`app-v2-account-deletion.sql`** — creates the `delete_own_account()` RPC (App Store guideline 5.1.1(v)). If your project blocks SQL writes to `auth.users`, deploy `../functions/delete-account/` instead — see that file's header.
7. **`app-v2-avatars-storage.sql`** — creates the public `avatars` storage bucket with owner-scoped write policies.

### V3 (run after ALL v2 files — any order among themselves)

The v3 files are independent of each other, so run them in any order once every v2 file has been applied:

- **`app-v3-events.sql`** — creates `events` + `event_rsvps` (the event calendar: chapter-scoped events with going/maybe/declined RSVPs). RLS: members read/create in their own chapter (chapter + creator pinned via `WITH CHECK`), creator or chapter admins update/delete; users manage only their own RSVP rows and only for in-chapter events. Backs `lib/events.ts` and the Events tab.
- **`app-v3-push.sql`** — creates `device_tokens` (Expo push tokens per user/device). Backs `lib/notifications.ts`.
- **`app-v3-chapters.sql`** — creates the `create_chapter(name, designation, university)` SECURITY DEFINER RPC so organic signups can found a chapter and become its owner.

The app degrades gracefully before these run (empty calendar, push registration no-ops, create-chapter shows a friendly error) — but the features only work once they're applied.

### V4 (run after `app-v1-chat.sql` — independent of v2/v3)

- **`app-v4-reactions.sql`** — creates `message_reactions` (emoji reactions on channel messages, GroupMe chat parity). RLS: read/react only on messages visible via `channel_messages` RLS (inherited through the EXISTS subquery, same pattern as v1 chat), insert own rows only, delete own rows only. Backs `lib/reactions.ts` and the reaction pills in the channel thread. Pre-migration the app just shows no pills.
- **`app-v4-notifications.sql`** — creates `notifications` (the in-app notification center: a durable per-user copy of every push, so users who denied push permission still see them). Depends only on `auth.users`, so it can run any time. RLS: users SELECT/DELETE their own rows; UPDATE limited to the `read` column via column-level GRANT (same approach as `channel_members.last_read_at`); **no INSERT policy** — only the `send-push` Edge Function writes rows (service role). Backs `lib/inbox-notifications.ts`, the `/notifications` screen, and the Home bell badge. Redeploy `../functions/send-push/` after applying so events start landing here; pre-migration the app shows an empty inbox and the function logs-and-continues.

## How to run

1. Go to Supabase Dashboard → SQL Editor → New Query.
2. Paste the contents of the file.
3. Click Run.
4. Repeat for the next file.

## Realtime

For live chat:

1. Enable Realtime on `channel_messages` (Supabase Dashboard → Database → Replication → add `channel_messages` to the `supabase_realtime` publication). The app subscribes to INSERTs filtered by `channel_id`.
2. **Private channels caveat:** classic `postgres_changes` subscriptions on Supabase **do respect RLS** — each subscriber only receives rows their policies allow — so exec/alumni messages won't leak to non-members. But verify it on this project: subscribe as an active member with a filter on the alumni channel's id and confirm no events arrive when an alum posts. If you later migrate to Realtime **Broadcast/Presence** channels (which do NOT read table RLS), you must add Realtime Authorization policies on `realtime.messages` before any private-channel traffic goes through them.

## After running — RLS acceptance-test checklist

The DB is the only real enforcement layer (client checks are cosmetic). Walk this list after every migration run, using real logins (app or SQL editor impersonation):

- [ ] **Alumni privacy** — as an **active member** (role ≠ 'Alumni'): `select * from channels;` must NOT include the `alumni` channel, and selecting that channel's `channel_messages` returns 0 rows. As an **alumni**, both are visible.
- [ ] **Cross-chapter isolation** — as a member of chapter A: selects on chapter B's `channels`, `channel_messages`, and `job_postings` all return 0 rows.
- [ ] **Exec membership lockdown** — as a **non-admin**: `insert into channel_members (channel_id, user_id) values ('<exec channel>', auth.uid());` must fail RLS. As an owner/manager it succeeds.
- [ ] **Membership column pin** — as a member of a public channel: `update channel_members set channel_id = '<exec channel>' where user_id = auth.uid();` must fail with "permission denied" (only `last_read_at` is grantable). Updating `last_read_at` succeeds.
- [ ] **Job pinning** — as the poster of a job: `update job_postings set chapter_id = '<other chapter>' where id = '<their job>';` must fail RLS (the `WITH CHECK` pin). Updating `is_open`/title in place succeeds.
- [ ] **Invites** — a non-admin calling `create_chapter_invite(...)` errors; `select * from chapter_invites;` as a non-admin returns 0 rows; `join_chapter(...)` for a user who already has a profile errors.

If any check fails, the corresponding migration didn't apply fully — re-run it and re-check.

## Full schema reference

See `../../greek-ties-app-docs/docs/DATABASE.md` for every column's meaning and the complete data model (existing + new tables). **Caveat:** that repo is currently missing from this machine and from GitHub (see `docs/PRODUCTION_ROADMAP.md` → "Ground truth") — until it's recovered, the live database is the only source of truth for the pre-existing tables (`chapters`, `profiles`, `mentorship_requests`, `messages`), and these files are the source of truth for everything they create.
