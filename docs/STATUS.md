# Greek Ties — Working Status / Handoff

*Updated 2026-10-06. Read this current status, [Slice 6 readiness](SLICE_6_READINESS.md),
then [the launch runbook](LAUNCH_RUNBOOK.md). Older entries below are historical.*

## Current pilot status — no launch approval

- PR #4 is merged as `c165c7a`. GitHub CI passed typecheck, all tests, and lint.
  A clean local checkout also passes typecheck and **34 suites / 564 tests**;
  lint reports **0 errors / 24 warnings**. iOS and web bundle exports pass.
- The four SQL suites passed with `ON_ERROR_STOP=1` against the disposable local
  PostgreSQL 17.6 `greekties_qa` database; each rolled back its fixtures. A
  same-UUID concurrent insert race produced one commit and one rejection;
  first-insert rollback left no reservation; deleted-message retry did not
  resurrect it. Synthetic fixtures were removed and the QA container stopped.
  See the dated refresh in the [Slice 6 readiness report](SLICE_6_READINESS.md).
- **Read-only live Supabase inventory on 2026-10-06:** V8 membership marker is
  present; V9 reinstatement RPC, V10 map-consent column, and V11 retry ledger
  are absent. Do not distribute the dependent client until the reviewed V9 →
  V10 → V11 rollout is authorized and completed. V10 clears existing map
  coordinates and defaults sharing off; preserve that data impact in the owner
  approval and member communication.
- GitHub Pages is disabled, no Actions variables are configured, and the invite
  URL returns HTTP 404. EAS shows Build 12 completed but not submitted; Build 11
  is the latest submission. App Store Connect review/metadata state and physical
  device journeys were not independently verified.
- Draft dependency PR #5 passes CI and Expo compatibility checks; it does not
  clear the audit. Its candidate still reports **61 advisories (49 high, 12
  moderate)**. See the readiness refresh for the exact scope and remaining gates.
- Current source has five visible tabs (Home, Chats, Events, People, Me), admin
  access through Me, useful chapter activity on Home, a profile hub on Me,
  optional explicit map consent, recoverable chat/mentorship sends, and the
  Slice 5 event/directory/job/share refinements. Runtime verification is separate.
- `app.config.ts` already contains an EAS project ID. Do not run `eas init`
  based on older setup notes. Picker package 9.1.0 requires a compatible native
  binary; build 11 is not evidence that the current picker is installed.
- V10 clears legacy coordinates while retaining city and defaults consent off;
  older clients that send coordinates fail the whole profile save. V11 backfills
  message identities and preserves them after deletion. See the readiness report
  for compatibility, locks, and the complete verification sequence.

Next owner actions: review PR #5; configure Pages and its public build variables;
review V10's map-coordinate reset; authorize the production migration window;
then verify PostgREST/Realtime and run exact-build browser/device acceptance
before inviting more testers. No production change or launch approval is implied.

## Historical change set (2026-08-30: v4 — launch polish + notification center)

- **In-app notification center**: `lib/inbox-notifications.ts`,
  `app/notifications.tsx`, Home bell badge, and `app-v4-notifications.sql`.
  `send-push` now also writes durable notification rows for users who deny push.
- **Channel-message delete**: `deleteMessage()` in `lib/chat.ts`, long-press
  delete in channel threads, and `app-v4-chat-delete.sql` for own-message and
  admin moderation deletes.
- **Message reactions**: `lib/reactions.ts`, reaction pills/actions in channel
  threads, and `app-v4-reactions.sql`.
- **Local verification on 2026-08-30**: `npm run typecheck` passes,
  `npm test -- --runInBand` passes (11 suites / 122 tests), and `npm run lint`
  passes with 0 errors / 29 warnings. Remaining warnings are the existing
  React compiler `set-state-in-effect` data-loading patterns.

## Previous change set (v3 — public-release features)

- **Push notifications**: `lib/notifications.ts` (registration + tap routing, wired
  in `_layout.tsx`; sign-out unregisters), `supabase/functions/send-push/` (webhook-
  secret-gated Edge Function), `app-v3-push.sql`, runbook in `docs/PUSH_NOTIFICATIONS.md`.
  Requires EAS projectId (`eas init`) + a dev build — no-ops in Expo Go/simulator.
- **Onboarding escape hatch**: `/onboarding/enter-code` (paste code or full link) and
  `/onboarding/create-chapter` (backed by the `create_chapter` RPC in
  `app-v3-chapters.sql`, seeds default channels, founder becomes owner). Home's
  no-chapter empty state now routes to both.
- **Member invite loop**: `components/InviteCard.tsx` on Home when chapter < 15
  members (share/copy the invite link).
- **Event calendar**: Events tab (agenda grouped by day, category filters), create +
  detail screens with RSVPs (`app-v3-events.sql`, `lib/events.ts`).
- **Tests + lint**: jest-expo, ESLint flat config, Prettier, CI runs typecheck
  + tests + lint.
- **Launch guide**: `docs/LAUNCH_RUNBOOK.md` is now the end-to-end go-live checklist
  (migrations → accounts → verification → submission → day-1 ops).

The historical inventory was 15 migrations. The current migration README
extends it through V11; use its dependency order and the Slice 6 readiness gates.

## Context

- Repo: https://github.com/pkarakala/greekties — Expo SDK 56 / RN 0.85 / React 19,
  expo-router, shared Supabase backend (`sdscrvoorrygesrhjeee.supabase.co`).
- **Historical cross-device workflow:** development originally used a laptop
  without Xcode and a separate simulator machine. Slice 6 now finds local
  Xcode/simctl; installed candidate/backend compatibility remains unverified.
- Design direction: **cream / gold / navy** light theme (matches the Greek Ties
  website). Done — see `theme/colors.ts`.

## What was just built (Phases B/C/D of the roadmap, one large change set)

**Core loops fixed:**
- Join flow works in every auth state (`app/_layout.tsx` gate rewrite,
  server-only preview/join RPCs with no fail-open legacy fallback, invite-code
  persistence through email confirmation via `lib/invite.ts` + login/signup wiring).
- Profile editing + avatar upload (`app/profile/edit.tsx`, `lib/profile.ts`,
  Supabase Storage `avatars` bucket).
- Forgot/reset password (`app/forgot-password.tsx`, `app/reset-password.tsx`).
- Me tab is a real account screen: edit profile, legal links, support,
  **delete account** (`delete_own_account` RPC + Edge Function fallback).

**Compliance pack (App Store):**
- Report content + block users (`lib/moderation.ts`, wired into profile & job screens).
- Terms/Privacy drafts in `docs/legal/`, linked at signup and in Me.
- App icon / adaptive icon / splash in `assets/` (generated by
  `scripts/generate-assets.js`), `app.json` → `app.config.ts`, `eas.json`,
  iOS infoPlist usage strings, `docs/APP_STORE_CHECKLIST.md`.

**Security:**
- RLS holes fixed in `supabase/migrations/app-v1-chat.sql` (channel self-add) and
  `app-v1-jobs.sql` (cross-chapter job moves; adds `is_open`).
- New migrations: `app-v2-invites.sql` (server-side invite codes, `join_chapter`,
  `create_chapter_invite`), `app-v2-moderation.sql` (`content_reports`,
  `user_blocks`), `app-v2-account-deletion.sql`, `app-v2-avatars-storage.sql`.
  Run order + acceptance tests in `supabase/migrations/README.md`.
- PII over-fetch fixed (`lib/queries.ts` column lists exclude email/coords where unused),
  URL-scheme validation for user links (`lib/url.ts`).

**Reliability/UX:**
- Mentorship threads now realtime (parity with channel chat), chat paginated
  (last 50 + load earlier), blocked-user filtering, error boundary, friendly
  missing-.env screen, lazy Mapbox import (Expo Go safe), home quick actions route
  correctly, light-theme legibility pass, CI workflow (typecheck on push/PR).

## Historical next steps (2026-08-30; superseded by current status)

The following records the earlier handoff, not current commands or permission.
The “never run” claim below predates owner-reported TestFlight build 11.

1. **Commit + push this readiness update** so the Xcode machine sees the v4
   runbook and lint cleanup.
2. **On the Xcode machine:** pull, `npm ci`, fill `.env`, run per `docs/SIMULATOR_SETUP.md`,
   and smoke-test — the app has still never been run on a device.
3. **Blocked on the owner (cannot proceed without):**
   - Supabase dashboard access — run migrations through v4 (order in
     `supabase/migrations/README.md`), enable Realtime/publication requirements
     for `channel_messages`, `messages`, `mentorship_requests`, and
     `message_reactions`, create the `avatars` bucket policies, deploy the
     delete-account and send-push Edge Functions, and wire Database Webhooks.
   - Locate the companion website repo + `greek-ties-app-docs` repo (own the
     schema/RLS for profiles/chapters/mentorship/messages) — still missing.
   - Accounts: Apple Developer, Expo/EAS (`eas init`), Mapbox (pk.* + sk.* tokens).
4. **After that:** TestFlight build, physical-device push verification, seeded
   demo chapter/account, screenshots, and App Store Connect metadata.

## Conventions

- All colors via `theme/colors.ts` keys — never hardcode hex in screens.
- Every Supabase call that touches a table/RPC that may not exist yet (pre-migration)
  must degrade gracefully — catch, fall back, never surface raw Postgres errors.
- Data hooks live in `lib/`, follow the existing `{ loading, error, data, reload }` shape.
- Commit/push only within separately authorized scope; preserve uncommitted
  implementation work during local QA and documentation sessions.

## v3.1 (ops + polish)

- **Admin reports queue** — chapter admins can review/resolve `content_reports`.
- **Server-side unread** — unread counts computed in the DB instead of the client.
- **Geocoded alumni map** — member locations geocoded so the map has real pins.
- **Mentorship message reporting** — report messages inside mentorship threads.
- **Jobs `is_open` filter + pagination** — closed roles filterable, board paginated.
- **Directory pagination** — the People tab pages through large chapters.
- **Home events teaser** — a "Coming up" section on Home shows the next upcoming
  event (`components/NextEventCard.tsx`) with a "See all" link to the Events tab;
  hidden when there are no events or the events tables don't exist yet.

## v3.2 (startup round)

- **Message reactions** — react to channel/mentorship messages.
- **Post-join profile completion** — `components/ProfileNudgeCard.tsx` nudges new
  members through the six fields that make them findable (exported
  `profileCompleteness()` helper).
- **Network breakdown screen** — where the chapter's alumni work/live, at a glance.
- **Admin member management** — chapter admins can manage members in-app.
- **Web session fix + HTTPS invite links** — web builds persist auth sessions;
  invite links share as `https://` URLs.
- **Test coverage 4 → 8 suites** — new suites for `lib/events.ts` (missing-table
  degradation + day-grouping helpers), `lib/jobs.ts` (`fetchJobsPage`/`isMissingIsOpen`
  exported so the `is_open` retry path is testable), `lib/chapters.ts` (RPC error
  mapping), and `profileCompleteness()`.
- **Accessibility pass** — `accessibilityRole`/`accessibilityLabel`/`accessibilityState`
  on Chip, SearchBar, Card, SegmentedControl, and ScreenHeader (selected state on
  chips/segments, labeled icon-only back/clear buttons, header role on titles); no
  visual changes.
