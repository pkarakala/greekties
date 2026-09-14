# Supabase Migrations — Greek Ties App

Tables, functions, storage, policies, and grants the mobile app needs. V1-V5
primarily add app objects; the P0 V6 migration intentionally replaces policies,
functions, and client grants on existing tables. Every file is idempotent.

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

- **`app-v4-chat-delete.sql`** — adds DELETE policies on `channel_messages`
  so members can delete their own channel messages and chapter admins can
  moderate any channel message in their chapter. Also sets
  `channel_messages replica identity full` so realtime DELETE payloads carry
  the deleted row's id. Backs `deleteMessage()` in `lib/chat.ts` and the
  long-press delete action in channel threads.
- **`app-v4-reactions.sql`** — creates `message_reactions` (emoji reactions on channel messages, GroupMe chat parity). RLS: read/react only on messages visible via `channel_messages` RLS (inherited through the EXISTS subquery, same pattern as v1 chat), insert own rows only, delete own rows only. Backs `lib/reactions.ts` and the reaction pills in the channel thread. Pre-migration the app just shows no pills.
- **`app-v4-notifications.sql`** — creates `notifications` (the in-app notification center: a durable per-user copy of every push, so users who denied push permission still see them). Depends only on `auth.users`, so it can run any time. RLS: users SELECT/DELETE their own rows; UPDATE limited to the `read` column via column-level GRANT (same approach as `channel_members.last_read_at`); **no INSERT policy** — only the `send-push` Edge Function writes rows (service role). Backs `lib/inbox-notifications.ts`, the `/notifications` screen, and the Home bell badge. Redeploy `../functions/send-push/` after applying so events start landing here; pre-migration the app shows an empty inbox and the function logs-and-continues.

### P0 security hardening (run last)

- **`app-v6-p0-authorization-invites.sql`** — requires `profiles.status = 'approved'`
  across chapter, channel, events, admin, mentorship, jobs, and moderation;
  replaces broad client grants with least-privilege table/column grants; moves
  profile approval/rejection/role changes behind admin RPCs; and adds the
  `resolve_chapter_invite(code)` preview RPC so invitees never read
  `chapter_invites` directly. Redeploy `../functions/send-push/` so its
  service-role recipient filtering is active.

- **`app-v7-p0-followup.sql`** — validates the live nullable-text status shape,
  adds a rejected-safe lifecycle check, replaces client-facing permissive
  policies by catalog scope (including differently named policies), and
  reapplies least-privilege grants for `profiles` and `chapters`. It runs in one
  explicit transaction, verifies every profile field used by edit/onboarding,
  and aborts rather than committing a broken profile editor. Run immediately
  after V6, then run `../tests/p0-authorization-invites.sql` to verify
  pending/approved/rejected, cross-chapter, profile-edit, invite, and non-admin
  behavior in a rolled-back transaction.

- **`app-v8-security-membership-blocks.sql`** — separates user-editable
  professional `role` text from server-controlled `membership_type`, changes
  alumni channel authorization to the controlled field, adds an admin-only
  designation RPC, and applies symmetric block filtering to profiles, jobs,
  events/RSVPs, channel messages/reactions, mentorship, realtime SELECT
  delivery, and notifications. Legacy actor-driven notifications without a
  trustworthy actor id are hidden fail-closed. Existing rows intentionally start as `active`;
  verified alumni must be re-designated by an admin before release. Redeploy
  `../functions/send-push/` after this migration so service-role notification
  fan-out also enforces blocks. Then run
  `../tests/p0-membership-blocks.sql` in a non-production validation database.

### V7 live-schema assumptions and restrictive-policy preflight

The live project is the source of truth for pre-existing tables. On 2026-09-12,
this read-only `information_schema` query returned 24 `profiles` columns:

```sql
select ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
```

Expected names, in order: `id`, `user_id`, `chapter_id`, `name`, `email`,
`class_year`, `role`, `industry`, `city`, `company`, `job_title`,
`open_to_mentor`, `bio`, `created_at`, `status`, `admin_role`,
`theme_preference`, `lat`, `lng`, `avatar_url`, `linkedin_url`,
`seeking_mentor`, `chapter_role`, `is_hiring`. `status` was nullable `text`
with default `pending`; `profiles` had only its primary key and user/chapter
foreign keys, so there was no status check. `major`, `graduation_year`, and
`pronouns` do not exist and must not appear in grants. Existing status values
were 200 `approved`, 5 `pending`, and 1 `rejected`, with no null or unexpected
value. RLS was enabled (not forced) on both `profiles` and `chapters`; chapter
columns `name` and `designation` both existed.

Re-run that query immediately before rollout. Also inventory policy topology:

```sql
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'chapters')
order by tablename, permissive, policyname;
```

The same inspection found eight legacy PERMISSIVE policies and no RESTRICTIVE
policies on these tables. V7 drops only client-facing PERMISSIVE policies.
Unknown RESTRICTIVE policies are intentionally preserved because they combine
with permissive policies using `AND`; if one could affect authenticated
profile SELECT/UPDATE, V7 aborts before commit so an operator can review its
owner and rationale. Never delete an unknown restrictive policy just to make
the migration pass.

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

- [ ] **Alumni privacy** — as an **active member** (`membership_type = 'active'`): setting editable `role = 'Alumni'` must not expose the alumni channel. An approved admin can designate `membership_type = 'alumni'` only through `set_chapter_member_membership_type(...)`, after which the alumni channel and its messages are visible.
- [ ] **Cross-chapter isolation** — as a member of chapter A: selects on chapter B's `channels`, `channel_messages`, and `job_postings` all return 0 rows.
- [ ] **Exec membership lockdown** — as a **non-admin**: `insert into channel_members (channel_id, user_id) values ('<exec channel>', auth.uid());` must fail RLS. As an owner/manager it succeeds.
- [ ] **Membership column pin** — as a member of a public channel: `update channel_members set channel_id = '<exec channel>' where user_id = auth.uid();` must fail with "permission denied" (only `last_read_at` is grantable). Updating `last_read_at` succeeds.
- [ ] **Job pinning** — as the poster of a job: `update job_postings set chapter_id = '<other chapter>' where id = '<their job>';` must fail RLS (the `WITH CHECK` pin). Updating `is_open`/title in place succeeds.
- [ ] **Invites** — a non-admin calling `create_chapter_invite(...)` errors;
  direct `select * from chapter_invites;` fails with permission denied for every
  API client; `resolve_chapter_invite(...)` returns only a valid invite's display
  fields; and `join_chapter(...)` for a user who already has a profile errors.
- [ ] **Allowed profile edit** — as an approved member, update and reload all
  fields used by `app/profile/edit.tsx` and onboarding: `name`, `class_year`,
  `role`, `industry`, `city`, `company`, `job_title`, `linkedin_url`, `bio`,
  `open_to_mentor`, `is_hiring`, `avatar_url`, `lat`, and `lng`. Every value
  persists on the caller's own row.
- [ ] **Denied profile escalation** — as that member, separate direct updates
  to `status`, `chapter_id`, `user_id`, `admin_role`, and `membership_type` each fail with
  permission denied and change nothing. An ordinary-field update targeting a
  different member changes zero rows.
- [ ] **Block enforcement** — after A blocks B, each side receives zero rows for
  the other's profiles, jobs, events/RSVPs, channel messages/reactions, and
  mentorship requests/messages; B-authored notifications and their deep links
  disappear for A; neither side can create a mentorship request or direct
  message to the other; Postgres Changes does not deliver B's messages to A;
  push fan-out excludes the relationship. After A unblocks B, visibility and
  permitted interaction return.
- [ ] **Restrictive-policy preservation** — re-run the `pg_policies` inventory;
  unexpected RESTRICTIVE policies remain present and have a reviewed
  owner/rationale. If V7 aborted on one, resolve the review before retrying.

If any access check fails, stop the rollout and diagnose before retrying. Do
not remove an unknown restrictive policy without understanding its purpose.

## Full schema reference

See `../../greek-ties-app-docs/docs/DATABASE.md` for every column's meaning and the complete data model (existing + new tables). **Caveat:** that repo is currently missing from this machine and from GitHub (see `docs/PRODUCTION_ROADMAP.md` → "Ground truth") — until it's recovered, the live database is the only source of truth for the pre-existing tables (`chapters`, `profiles`, `mentorship_requests`, `messages`), and these files are the source of truth for everything they create.
