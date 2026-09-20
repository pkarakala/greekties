# Greek Ties — Launch Runbook

*Reconciled 2026-09-17. Future operator procedure, not authorization to execute
remote actions, builds/uploads, deployment, commits/pushes, or distribution.*

**Current decision: NO-GO.** Read [Slice 6 readiness](SLICE_6_READINESS.md) for
evidence and prerequisites and the [steward runbook](STEWARD_DISTRIBUTION_RUNBOOK.md)
for the two UCSB chapters. Slices 1–5 are accepted locally (latest review:
34 suites / 564 tests, typecheck/diff pass; lint 0 errors / 24 warnings).
No SQL, installed picker, or browser/device acceptance follows from those tests.
TestFlight build 11 and live V6–V8 are owner-reported historical state, not
verified here. V9–V11 are unapplied drafts. Every checkbox below needs actual
evidence tied to the candidate; do not replay completed setup based on old notes.

Preserve uncommitted work. Companion docs: [App Store checklist](APP_STORE_CHECKLIST.md),
[migration README](../supabase/migrations/README.md), and the saved
[local SQL QA procedure](SESSION_3_QA_PROMPT.md). Simulator setup instructions
do not prove isolation; never use the existing app environment for disposable QA.

---

## A. Backend (Supabase project `sdscrvoorrygesrhjeee`)

Prerequisites: authoritative base schema and confirmed disposable **local**
synthetic backend for acceptance first. No such backend was confirmed in Slice 6.
Remote dashboard access and migration application require separate authorization
and an inventory of what is already applied; no remote access occurred here.

### A1. Validate the migration sequence, then separately authorize rollout

Inventory the supplied schema artifact before restore. For an original pre-V1
base, load its dependencies first, then this sequence. For a snapshot already
containing later migrations, verify that inventory and apply only missing
reviewed dependencies; a new empty local database does not mean the artifact
needs all migrations replayed. For an existing remote database, after separate
approval apply only missing reviewed migrations. Earlier scripts can overwrite
later grants/policies; **V10 and V11 are not safe to rerun**. Full rationale:
`supabase/migrations/README.md`.

1. [ ] `app-v1-chat.sql` — channels, channel_messages, channel_members + RLS
2. [ ] `app-v1-jobs.sql` — job_postings (+ `is_open`) + RLS
3. [ ] `app-v1-seed-channels.sql` — default channels for existing chapters (after #1)
4. [ ] `app-v2-invites.sql` — chapter_invites + `join_chapter` / `create_chapter_invite` RPCs
5. [ ] `app-v2-moderation.sql` — content_reports + user_blocks
6. [ ] `app-v2-account-deletion.sql` — `delete_own_account()` RPC (if it can't
       delete from `auth.users`, the Edge Function in A3 is the fallback — see
       that file's header)
7. [ ] `app-v2-avatars-storage.sql` — public `avatars` bucket + owner-scoped
       write policies (if `create policy` fails with "must be owner", recreate
       the policies via Dashboard → Storage → avatars → Policies; expressions
       are in the file)
8. [ ] `app-v3-chapters.sql` — `create_chapter()` RPC (organic signups found a
       chapter, become owner, default channels seeded)
9. [ ] `app-v3-events.sql` — events + RSVPs + RLS
10. [ ] `app-v3-push.sql` — device_tokens + RLS
11. [ ] `app-v4-chat-delete.sql` — own/admin channel-message deletion + realtime DELETE payload support
12. [ ] `app-v4-notifications.sql` — durable in-app notification center
13. [ ] `app-v4-reactions.sql` — channel-message emoji reactions + RLS
14. [ ] `app-v5-chat-rls-recursion.sql` — recursion-free channel authorization helpers
15. [ ] `app-v6-p0-authorization-invites.sql` — approved-profile gates,
        least-privilege grants, server-only admin lifecycle, secure invite preview
16. [ ] `app-v7-p0-followup.sql` — live-schema/status validation, catalog-scoped
        profile/chapter policy replacement, and fail-closed profile grants
17. [ ] `app-v8-security-membership-blocks.sql` — controlled active/alumni
        designation, block-aware RLS/realtime, and notification actor tracking
18. [ ] `app-v9-pilot-reinstatement.sql` — removed members cannot restore access
        through invitations; explicit authorized reinstatement clears admin roles
19. [ ] **Local reset fixture only:** seed legacy city/coordinates, then apply
        `app-v10-explicit-map-consent.sql` once; verify default off, cleared
        coordinates, retained city, and safe refusal of a second application
20. [ ] **Local backfill fixture only:** seed legacy messages in both tables,
        then apply `app-v11-message-retry-identities.sql`; verify UUID primary
        keys, backfill, lock behavior, protected ledger and deletion non-resurrection

V9 → V10 → V11 must precede candidate-client distribution after separate
authorization. Do not seed legacy fixtures remotely. V10 makes older clients'
coordinate-bearing profile saves fail in full; coordinate the client update and
support plan. Old city-only changes remain allowed and clear pins on change.
Never reapply V6–V9 grants over V10 or restore legacy coordinates as rollback.
V11 backfills identities under write-blocking locks; old clients using default
UUIDs remain supported. Do not prune identities/remove triggers while retries
may exist. Record local results separately from later remote application.

For an authorized baseline reconstruction, before V6/V7/V8 use the read-only
`information_schema.columns` and `pg_policies` inventory in
`supabase/migrations/README.md`. The 2026-09-12 live
baseline has 24 profile columns, nullable `text` status with no check, and no
values outside `approved`/`pending`/`rejected`; RLS is enabled (not forced),
and there are no RESTRICTIVE profile/chapter policies. If that changes, stop
and review. V7 preserves unknown restrictive policies and aborts
transactionally if one could block authenticated profile SELECT/UPDATE.

After V8 in the disposable environment, use the admin member screen to designate synthetic
alumni. Do not derive those values from historical `profiles.role`; that field
was user-editable and is intentionally treated as untrusted. After V11, run all
four SQL acceptance files locally. A separately authorized operator must verify
the V8-compatible `send-push` deployment and its block-aware fan-out.

> Graceful client errors do not establish release safety. The dependent client
> requires V9–V11; missing migrations remain release blockers.

### A2. Enable Realtime

Dashboard → Database → Replication → `supabase_realtime` publication → add:

- [ ] `channel_messages` — live channel chat
- [ ] `messages` — live mentorship threads
- [ ] `mentorship_requests` — live status flips (pending → accepted/declined)
- [ ] `message_reactions` — live channel-message reaction pills (after `app-v4-reactions.sql`)
- [ ] `user_blocks` — cross-device block-list refresh (V8 adds this publication entry transactionally)

Then verify the RLS/Realtime caveat in `supabase/migrations/README.md` →
"Realtime": subscribe as an active (non-alumni) member filtered to the alumni
channel's id and confirm **no** events arrive when an alum posts. Also confirm
the `supabase_realtime` publication has DELETE enabled for `channel_messages`
after `app-v4-chat-delete.sql`, so deleted bubbles disappear on other devices.

### A3. Deploy Edge Functions

From the repo root, with the Supabase CLI logged in (`supabase login`):

```bash
supabase functions deploy delete-account --project-ref sdscrvoorrygesrhjeee
supabase secrets set WEBHOOK_SECRET="<long-random-string>" --project-ref sdscrvoorrygesrhjeee
supabase functions deploy send-push --no-verify-jwt --project-ref sdscrvoorrygesrhjeee
```

- [ ] `delete-account` — account-deletion fallback. No secrets to configure
      (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` are
      platform-injected). Header of
      `supabase/functions/delete-account/index.ts` has the full flow.
- [ ] `send-push` — reads `device_tokens`, writes durable rows to
      `notifications`, and calls the Expo Push API. It requires only
      `WEBHOOK_SECRET`; `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are
      platform-injected.
- [ ] **Database Webhooks** for push: Dashboard → Database → Webhooks → create
      four HTTP POST webhooks to
      `https://sdscrvoorrygesrhjeee.supabase.co/functions/v1/send-push`, each
      with header `x-webhook-secret: <WEBHOOK_SECRET>`:
      `channel_messages` INSERT, `mentorship_requests` INSERT,
      `mentorship_requests` UPDATE, and `messages` INSERT. Full details:
      `docs/PUSH_NOTIFICATIONS.md`.

### A4. RLS acceptance tests (non-negotiable)

All fixture-writing suites and destructive acceptance checks below belong only
in the confirmed disposable local synthetic environment. A rollback does not
make them appropriate for production. Record each suite and concurrency result.

- [ ] Walk the full checklist in `supabase/migrations/README.md` → "After
      running — RLS acceptance-test checklist" (alumni privacy, cross-chapter
      isolation, exec lockdown, membership column pin, job pinning, invites).
- [ ] Run the per-file ACCEPTANCE TESTS footers in `app-v2-invites.sql`,
      `app-v2-account-deletion.sql` (staging/throwaway only — destructive),
      `app-v3-chapters.sql`, and all v4 migrations.
- [ ] Run `supabase/tests/p0-authorization-invites.sql`; it must complete
      successfully and rolls back all test fixtures. Check ordinary owner-editable
      fields, protected-column denial and cross-row denial. After V10, coordinate
      writes are denied; city/consent/location form behavior also requires the
      dedicated map suite and runtime checks.
- [ ] Run `supabase/tests/p0-membership-blocks.sql`; it must complete
      successfully and roll back all fixtures. It proves role edits cannot
      grant alumni access, admin designation hierarchy works, blocked content
      and notifications are hidden in both directions, realtime-era messages
      stay hidden, and unblocking restores visibility.
- [ ] Run `supabase/tests/pilot-map-consent.sql` after V10.
- [ ] Run `supabase/tests/pilot-message-retries.sql` after V11.
- [ ] Use two real local connections for stale map completion after opt-out,
      competing same-ID sends, first-insert rollback, commit/lost-response then
      deletion/retry, and access revocation. Verify uniqueness, no resurrection,
      and reservation rollback; record actual PostgREST/RLS/Realtime checks too.
- [ ] With a real approved test login, save the full profile form and reload it;
      then confirm direct protected-column updates fail with permission denied.
- [ ] Re-run the policy inventory. Any unexpected RESTRICTIVE policy must still
      exist and have a reviewed owner/rationale; do not silently drop it.

## B. Accounts & external services

- [ ] **Apple Developer Program** ($99/yr) — decide individual vs. organization
      (org needs a D-U-N-S number). Accept all pending agreements in App Store
      Connect → Business (builds can't be submitted with pending agreements).
- [ ] **Expo/EAS**:
      `app.config.ts` already contains `extra.eas.projectId`; verify the intended
      account/project when separately authorized. Do not initialize or replace
      it based on historical instructions. Verify EAS env vars for build profiles
      (Project → Environment variables, or `eas env:create`):
      - `EXPO_PUBLIC_SUPABASE_URL` (plain)
      - `EXPO_PUBLIC_SUPABASE_ANON_KEY` (plain — public *only* because RLS is
        verified in A4)
      - `EXPO_PUBLIC_MAPBOX_TOKEN` (plain, `pk.*`)
      - `MAPBOX_DOWNLOAD_TOKEN` (**secret**, `sk.*`)
      First builds:
      ```bash
      eas build --profile development --platform ios   # simulator dev client
      eas build --profile production --platform ios    # once credentials exist
      ```
      Let EAS manage iOS credentials (cert + provisioning profile). Because the
      app now ships push (`expo-notifications`), EAS will also provision the
      APNs key / push entitlement — accept that.
- [ ] **Mapbox** — create both tokens at account.mapbox.com → Access tokens:
      `pk.*` public (runtime maps) and `sk.*` with `DOWNLOADS:READ` scope
      (native SDK fetch at build time). Never commit either. Details:
      `docs/APP_STORE_CHECKLIST.md` §4.
- [ ] **Support inbox** — make `support@greekties.app` (or your chosen address)
      a real, monitored mailbox, and update `lib/legal.ts` +
      `docs/legal/*` if the address differs.
- [ ] **Privacy policy hosting** — a live URL is mandatory. GitHub-hosted
      markdown is acceptable for v1:
      `https://github.com/pkarakala/greekties/blob/main/docs/legal/PRIVACY_POLICY.md`
      (and `TERMS.md`). A `greekties.app` page can replace it later.

## C. Verification

### C1. Simulator smoke test (Xcode machine; see `docs/SIMULATOR_SETUP.md`)

First provide a compatible native runtime attached to an explicitly isolated
synthetic backend. Do not copy/use the existing remote app configuration. Record
build/source revision, backend migration versions, device/OS, tester and date.
The native binary must include picker 9.1.0 and Mapbox dependencies. TestFlight
build 11 is historical and unverified for current code; no build is authorized here.

- [ ] Complete every scenario group in [Slice 6 runtime QA](SLICE_6_READINESS.md),
      including both chapters/cohorts, interrupted install/invite/auth recovery,
      membership boundaries, map off, retry/discard, five tabs and admin return,
      RSVP/search/jobs, and share validation blur/refocus.
- [ ] Native date-first/time-first partial values reopen correctly; optional-end
      clearing saves null in create/edit without changing Start; Done/dismissal,
      timezone changes, DST gaps/repeated hours and unchanged instants are verified.
- [ ] Render small/large screens, enlarged text, keyboard, screen reader,
      Reduce Motion, actual icons and all loading/empty/error states. Static
      HTML generation and mocked native picker tests are not rendered/installed QA.

- [ ] Sign up (fresh email) → confirm → log in; forgot/reset password round-trip
- [ ] Join a chapter via invite code (mint one as an admin first) — through
      signup *and* while already signed in
- [ ] Create a chapter as a fresh no-invite user → lands as owner, default
      channels exist
- [ ] Every tab renders: Home, People (directory + filters), Chats (send a
      message; open a second simulator/account and see it arrive live), Events
      (create, RSVP, category toggles), Me
- [ ] Channel message polish: react to a message, see the reaction update on a
      second account, delete your own message, and confirm it disappears live
      on the second account
- [ ] Profile edit + avatar upload; alumni map renders (dev build with Mapbox
      token — Expo Go skips the map gracefully)
- [ ] Mentorship: request → accept → thread messages arrive live both ways
- [ ] Jobs: post, edit/close, open apply link
- [ ] Report a message + a profile; block a user (their content disappears)
- [ ] Delete account (throwaway account) → signed out, rows gone, re-signup works
- [ ] Airplane-mode / missing-.env states show friendly errors, not crashes

### C2. TestFlight internal

- [ ] Record separate build/upload/tester authorization and verified remote
      V9–V11 sequence; complete local SQL/concurrency and isolated runtime gates first.
- [ ] `eas build --profile production --platform ios` → `eas submit` (or upload
      via App Store Connect) → distribute to internal testers
- [ ] Re-run the C1 list on the exact TestFlight candidate, record installed
      picker compatibility, and verify the matching browser deployment. Only
      then request pilot-distribution approval; do not send invitations now.

### C3. Push on a physical device (push does not work in simulators)

- [ ] Install the TestFlight (or dev) build on a real iPhone, sign in, accept
      the permission prompt → confirm a row appears in `device_tokens`
- [ ] Trigger a push (send a channel message from another account) → banner
      arrives; tapping it deep-links to the right screen
- [ ] Open `/notifications` from the Home bell and confirm the same event is
      recorded even if push permission is denied
- [ ] Sign out → confirm the token is unregistered (no push after sign-out)

## D. Submission

Follow `docs/APP_STORE_CHECKLIST.md` top to bottom — app record, privacy
nutrition labels, age rating (17+ recommended), demo account + reviewer notes,
screenshots, final pre-submission sweep. Do not submit until every A/B/C box
above is checked.

## E. Day-1 operations

- [ ] **Moderation watch** — check `content_reports` at least daily
      (Dashboard → Table Editor, `status = 'open'`); App Review expects action
      on reports within 24h, and the reviewer notes promise it.
      ```sql
      select * from content_reports where status = 'open' order by created_at;
      ```
- [ ] **Support SLA** — monitor the support inbox; acknowledge within 24h.
      Account-deletion failures tell users to contact support, so it must work.
- [ ] **Invite-code rotation** — if a code leaks: Dashboard SQL Editor →
      ```sql
      update chapter_invites set revoked = true where code = '<leaked code>';
      ```
      then have a chapter admin reopen chapter settings in-app (mints a fresh
      code via `create_chapter_invite`).
- [ ] **Content takedown** — for a violating message/job/profile field, delete
      the row via Table Editor (service role bypasses RLS), mark the report:
      ```sql
      update content_reports set status = 'reviewed' where id = '<report id>';
      ```
      For membership removal, use the authorized admin removal control, which
      retains a rejected profile. Do not delete that row to bypass V9's invite
      restriction. Reinstatement is a separate admin decision; preserve evidence
      and follow the support process.
- [ ] **Incident basics** — Supabase Dashboard → Logs (API + Postgres) is the
      first stop for "app is down" reports; check https://status.supabase.com;
      the anon key can be rotated under Settings → API if it's ever abused
      (requires an EAS env update + new build, so treat as last resort).
      Keep `docs/STATUS.md` updated after every operational change.
