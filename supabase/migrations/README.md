# Supabase Migrations — Greek Ties App

Tables, functions, storage, policies, and grants the mobile app needs. V1-V5
primarily add app objects; the P0 V6 migration intentionally replaces policies,
functions, and client grants on existing tables. V1–V9 are idempotent; V10 deliberately refuses a second application to protect later consent.

**2026-09-16 Slice 1 status:** V6/V7/V8 are owner-reported live. V9 is a new,
unapplied local draft. Slice 2 adds the unapplied V10 draft described below. No production inspection, SQL execution, deployment,
or credential/configuration change occurred during Slice 1. The historical
operator instructions below are not authorization to run anything. Never rerun
V6/V7/V8 over V9: that would restore the earlier invite policy.

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
  after V6. The current `../tests/p0-authorization-invites.sql` requires V10 and verifies
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

### V9 pilot reinstatement — DRAFT / UNAPPLIED

The V10 section below extends this historical Slice 1 rollout sequence for the
current combined client and three acceptance suites.

`app-v9-pilot-reinstatement.sql` replaces only `join_chapter(text)` and adds
`reinstate_chapter_member(uuid)`. A valid shared invite cannot restore a
rejected/removed profile. Pending profiles still require admin approval.
Approved members can retry their own chapter's valid invite idempotently;
all other existing profiles retain the one-chapter restriction. The new RPC
requires an approved owner/manager in the target chapter, locks the actor and
target while checking authorization, accepts only rejected profiles, and
clears `admin_role`. It preserves controlled membership designation, blocks,
existing RLS, grants on tables, and other lifecycle RPCs.

Local SQL acceptance is **prepared, not executed**. No disposable local
database was confirmed; `psql` and Docker were unavailable on PATH. The SQL
suites write fixtures even though they roll back. Do not run them in production.

Future rollout, requiring separate authorization:

1. Prepare a confirmed disposable local database with the application's base
   schema and all prior migrations through V8. Review V9 and V10, apply them there in order, then
   run both `../tests/p0-authorization-invites.sql` and
   `../tests/p0-membership-blocks.sql` with fail-on-error enabled. The first
   suite now deliberately denies rejected-member invite rejoining and checks
   anonymous/non-admin/pending/removed/cross-chapter reinstatement denial,
   owner/manager reinstatement, no restored admin privilege, unchanged alumni
   designation/blocks, idempotent joining, and invalid/revoked/expired codes.
   The second suite must still pass unchanged for block and membership RLS.
2. Verify invitation and recovery journeys against that disposable backend on
   web and native. Check HTTPS and custom-scheme links, login/signup, email
   confirmation followed by returning to log in, cold starts, failed reads,
   offline retries, cancellation/replacement, both pilot identities, pending,
   removed, wrong chapter, and password reset. Confirm the existing auth
   redirect allowlist and hosting serve the HTTPS reset URL in `lib/links.ts`
   plus `greekties://reset-password`; this session changed neither. Exercise
   token/PKCE recovery links without printing or recording tokens.
3. After separate deployment approval, apply V9 **before** distributing the
   updated client or expanding invitations. Do not reapply V6/V7/V8. Server
   enforcement then also protects older installed clients: an old client's
   rejoin call fails, although its error copy may be generic and it has no
   reinstatement UI. The new client against V8 alone is not a policy fix;
   old clients could still self-restore, and the new reinstatement action
   will fail closed because its RPC is missing.
4. Verify the exact candidate build and browser deployment before distribution.
   An approved admin uses **Admin → Members → View removed / declined members
   → Reinstate → Confirm reinstatement**. The restored member uses **Check
   again** in membership help (or reopens the app). Assign any manager role
   separately through the existing owner-only action. Stop rollout on any
   authorization failure; do not roll back to invite-based reapproval.

Device/browser UI, email delivery, deep-link handoff, deployed auth settings,
SQL execution, and exact-build QA remain pending. Mocked tests are not evidence
that the live policy has changed. Browser storage does not transfer to a newly
installed app; the user must reopen the original invitation or paste its code.

### V10 explicit map consent — DRAFT / UNAPPLIED

`app-v10-explicit-map-consent.sql` follows V9. **Neither is applied.** Existing
RLS, symmetric blocks, membership/admin designation, and chapter boundaries
remain unchanged. Map consent adds `map_sharing_enabled` (default false) and a
server-managed `map_revision` UUID. Only approved members can modify their own
city/consent through the RPC; only approved, consenting alumni can publish a pin.
Active members can save consent, but require admin designation and another Save
in Edit profile to publish a location after designation. No GPS is requested.

**Legacy transition:** in one transaction, all pre-existing coordinates are
cleared; every member starts off. Profile city and other fields are preserved.
There is no inferred opt-in or production backfill. Members who want a pin must
explicitly enable the switch and save in the updated client. V10 is deliberately
one-time: a second run fails on existing columns rather than resetting later
consent. Do not reapply V6–V9 to a V10 database: earlier grants can reopen direct
coordinate writes, and V6 also restores the obsolete invite policy.

`set_profile_map_sharing` compares the caller's expected revision, saves the city
and consent, clears both coordinates, and returns a new revision **before** the
client looks up the city. `complete_profile_map_location` only accepts that
still-current revision for an eligible consenting member and returns another
revision on success (null on an obsolete/ineligible attempt). All phase-1 saves,
including repeated off/same-city saves, invalidate older requests. City,
consent, designation, status, and chapter transitions also invalidate coordinates
and revisions through a trigger. A constraint requires valid coordinate pairs,
nonempty city, approved alumni designation, and consent. RPC privileges are
explicit and search paths fixed; their ownership checks do not bypass peer RLS.

Direct client writes to coordinates, consent, and revision are revoked. **Old
clients that include coordinates in a profile update will receive a save error;
the whole write fails.** They cannot silently restore sharing after opt-out.
Old city-only edits remain allowed but clear an existing pin on change. Older
clients can still read consenting members' coordinates under existing RLS.
Already-rendered pins on another device can remain cached until it reloads;
server enforcement controls subsequent reads and writes, not copies already read.

Against a server without V10, the new client shows no legacy pins, disables the
sharing switch, and reports that city/map settings cannot be saved. Other valid
profile fields can still save; there is **no direct-coordinate fallback**. This
client behavior alone does not remove legacy data or secure older clients.

Future separately authorized rollout:

1. Prepare a confirmed disposable local database with the base schema and V1–V9.
   Seed a legacy approved alumnus with a profile city and coordinates. Apply V10
   once; verify the city is unchanged, consent is false, and both coordinates
   are null. Verify a second application fails without modifying later opt-ins.
2. Run all three suites with fail-on-error: `p0-authorization-invites.sql`,
   `p0-membership-blocks.sql`, and `pilot-map-consent.sql`. The first suite's
   ordinary-field checks now require coordinate writes to be denied; all Slice 1
   reinstatement assertions remain. Verify concurrent sessions: hold phase 2,
   save off/new city in another session, then finish the obsolete lookup/save.
3. Verify local-backend web/native consent, reload/restart, active-to-alumni
   transitions, both self/peer pins, blocks, changed/cleared city, missing token,
   offline/timeout and ambiguous persistence. Verify old-client coordinate
   updates fail without restoring pins. Check enlarged text, VoiceOver, keyboard,
   photo-picker return, and error recovery; carry forward every Slice 1 gate.
4. After separate review and deployment approval, apply V9 then V10 before
   distributing the client. Coordinate the update because old-client profile
   saves containing coordinates will fail. Never distribute this as a completed
   privacy transition on V8/V9 alone. Run exact-build/browser QA before expanding
   invitations. Do not restore legacy coordinates as a rollback.

**Local status:** no disposable database, SQL execution, real native/browser UI,
production access, migration application, deployment, EAS/credential changes,
build, commit, or push occurred. `psql` and Docker were absent from PATH. Mocked
Jest checks cover form/save/query/pin behavior, not executed database policy.

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
  fields; after V9, `join_chapter(...)` is idempotent only for an approved
  same-chapter member and denies pending/removed/different-chapter profiles.
- [ ] **Allowed profile edit** — as an approved member, update and reload all
  fields used by `app/profile/edit.tsx` and onboarding: `name`, `class_year`,
  `role`, `industry`, `city`, `company`, `job_title`, `linkedin_url`, `bio`,
  `open_to_mentor`, `is_hiring`, and `avatar_url`. Every value persists on the
  caller's own row. After V10, direct `lat`/`lng` writes must be denied; verify
  map consent and coordinate RPCs with `../tests/pilot-map-consent.sql`.
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

## Slice 3: V11 message retry identities — unapplied draft (2026-09-17)

`app-v11-message-retry-identities.sql` is local review material only. It has
**not been executed**. It follows V10; do not edit/reapply V1–V10 to enable retries.

The Slice 3 client uses one UUID per logical text send in both `channel_messages`
and mentorship `messages`. It uses INSERT and ordinary RLS-protected exact-ID
reads, with no upsert or broader update permission. Existing primary keys stop
simultaneous duplicate rows, but physical deletion releases those keys. V11 is
required before distributing this client so a lost-response retry cannot recreate
a sender/admin-deleted message.

V11 keeps only `(message_table, message_id)` in an RLS-enabled ledger with no
anon/authenticated privileges. It backfills current IDs and installs a fixed-search-
path trigger whose reservation commits/rolls back atomically with the INSERT.
Deleting a message retains its identity; neither content nor account/chapter IDs
are retained in the ledger. A duplicate remains an error, not delivery evidence.
The client confirms only by reading the exact matching message under current RLS.
If the row is deleted or inaccessible, it cannot confirm delivery from the ledger.

Compatibility and local acceptance sequence (all still pending):

1. Recover the actual base schema into a **confirmed disposable local database**.
   The base `messages` DDL is absent here; V11 explicitly aborts unless both
   message IDs are single-column UUID primary keys. Keep the existing policy
   and privilege inventory; V11 does not change message grants/RLS.
2. Apply the established V1–V8 sequence, V9, legacy location seed, then V10 and
   its reset checks. Before V11, seed at least one legacy message in each table.
   Apply V11 once. Its backfill/trigger installation takes write-blocking locks
   on the two message tables for the migration transaction; review timing on
   representative local data before any separately authorized rollout.
3. Execute all four suites: `p0-authorization-invites.sql`,
   `p0-membership-blocks.sql`, `pilot-map-consent.sql`, and the new
   `pilot-message-retries.sql`. The new suite checks authenticated ID inserts,
   duplicate rejection, exact authorized reads, intentional identical text,
   protected IDs/content, old-client default IDs, deletion non-resurrection,
   denied-write rollback, membership/channel/participant/block isolation, and
   ledger privileges. It is not a replacement for the older suites.
4. In two real concurrent local connections, insert the same logical UUID in
   parallel, including first-transaction rollback. Check one committed row and
   one reservation after success, and no reservation after a denied/rolled-back
   write. Simulate commit with response loss, deletion before retry, and access
   revocation between preflight and INSERT. Check sender/admin delete and
   realtime ordering against the actual installed Supabase stack.
5. Verify native/browser keyboard, accessibility, timeout, navigation, foreground
   revalidation, and logout using a local backend. Then obtain independent
   Slice 3 review. Production migration/distribution remains separately gated.

Older clients that omit message IDs keep working: their default UUIDs are recorded
by the trigger. Their own retry behavior is unchanged. V9/V10 compatibility costs
remain in force. Do not remove the V11 triggers or prune the ledger while any
client may retain an attempt; doing so releases deleted identities for reuse.
There is no automatic ledger retention/pruning policy in this bounded slice.
No live credentials, remote SQL, migrations, builds, or deployment were used.
