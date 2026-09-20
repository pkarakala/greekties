# Greek Ties pilot implementation plan

Recorded: 2026-09-16. Updated: 2026-09-17. Status: Slices 1–5 accepted locally for source/tested behavior; owner approves visual direction. Slice 6 distribution documents and readiness assessment prepared; SQL/runtime execution blocked on prerequisites. V9–V11 unapplied; SQL/concurrency, native picker and rendered/browser/device release QA pending. No release approval.

## Purpose and authorization

The user accepted the product, engineering, and launch audit and asked for a
durable plan and a prompt for a fresh implementation session. This document
preserves those decisions. It is not authorization to deploy, modify live data,
or run migrations against production. The original audit was read-only; only
these handoff documents were created afterward.

Implement one coherent slice per session. Read current source before changing
it; the observations below describe the audit baseline, not permanent facts.
Update the progress log after each slice, separating local completion from
database deployment and physical-device verification.

## Baseline

- Repository: `/Users/pkarakala/Desktop/greekties`.
- Audited commit: `5894702` (`fix: nest App Store app id in EAS submit config`).
- Pilot: Sigma Phi Epsilon, UCSB, and Pi Beta Phi, UCSB.
- Product: private professional chapter networks; preserve chapter isolation.
- Stack: Expo React Native, Expo Router, Supabase, Mapbox.
- User-reported deployment: iOS TestFlight build 11; Supabase V6, V7, V8 live.
- Source audit only: no installed-build visual inspection or production queries.
- Local verification: typecheck passed; 13 Jest suites / 139 tests passed;
  lint passed with 0 errors / 27 warnings. These do not establish live behavior.
- Several existing launch documents describe older deployment states. Do not
  re-run live migrations or initialize EAS based on those stale statements.

## Accepted product decisions

- Prioritize trust, clarity, activation, retention, and launch readiness.
- Feel: premium, prestigious, calm, exclusive, human-designed, professional.
- Preserve the cream/navy/gold identity. Use Instagram, X, Meetup, and Partiful
  only as interaction references; do not copy their visual identity or wording.
- Replace Home's recent-member recommendation rail with useful chapter activity
  drawn from existing authorized events, jobs, and conversations. No new generic feed.
- Make Me a complete profile hub using existing profile data, with settings below.
- Keep Request mentorship, Pending, and Open conversation. No generic Connect.
- Events already have counts and Going/Maybe/Can't go states. Improve them;
  display Interested for the existing `maybe` value during the pilot.
- Add a modest attendee preview and simple Share to chat after reliability work.
- Pilot event-change communication can use organizer messages in existing channels.
  Automatic event-update notifications are a separate backend feature.
- Keep map sharing optional, explicitly explained, and independently switchable.
- Keep membership designation server-controlled; alumni activation needs a steward.
- Retain five member tabs; move admin access into Me. Surface mentorship in Chats.
- Defer tagging, recurring groups, complex scheduling, rich chat attachments,
  recommendation algorithms, generic DMs, and cross-chapter networking.

## Ordered implementation slices

| Order | Slice | Scope | Status |
| --- | --- | --- | --- |
| 1 | Safe, recoverable chapter entry | Invite persistence, auth/profile states, removal/reinstatement policy, chapter identity | Local corrections accepted; V9/SQL/device QA pending |
| 2 | Explicit map consent | Separate city from map participation, stale-coordinate fix, privacy copy | Accepted locally; V10/SQL/device QA pending |
| 3 | Reliable message sending | Preserve drafts, failed-send recovery, retry without duplicates | Accepted locally; V11/SQL/device QA pending |
| 4 | Home, Me, and shared visual foundations | Useful chapter activity, profile hub, five tabs, communication discovery, contrast and common states | Source/behavior accepted locally; owner approves direction; technical visual QA pending |
| 5 | Pilot event and directory refinements | RSVP reliability, attendee preview, time handling, mentor shortcut/search, job action clarity, simple sharing | Corrections independently accepted locally; runtime/SQL QA pending |
| 6 | Distribution and release verification | Install/join handoff, steward runbook, exact-build QA and rollout checklist | Documents prepared; readiness NO-GO; SQL/runtime prerequisites unresolved |

Resolve slices 1–3 and verify the install/join journey before expanding pilot
invitations. Slice 6 is a verification gate, not automatic deployment permission.
Do not implement the entire table in a single session.

## Slice 1: safe, recoverable chapter entry

### Confirmed source findings

1. `lib/invite.ts` persists pending invites exclusively through SecureStore and
   swallows storage failures. Unlike `lib/supabase.ts`, it has no web adapter.
2. `app/_layout.tsx` consumes/deletes the invite before the join completes.
   Auth routes and the join screen need a single coherent redirect lifecycle.
3. `lib/auth.tsx` returns null for profile-load errors as well as missing profiles.
   The route gate primarily checks session presence, not membership state.
4. `supabase/migrations/app-v6-p0-authorization-invites.sql` explicitly reapproves
   a rejected member using a valid same-chapter invite. Removal sets rejected.
   V7/V8 do not replace that join function in the audited repository.
5. `supabase/tests/p0-authorization-invites.sql` explicitly expects that rejoin
   behavior. This is an accepted policy change, not merely an accidental bug.
6. `app/join/[code].tsx` displays `designation ?? name`, which can omit the
   organization name. Invite-resolution errors are conflated with invalid codes.

### Required behavior

- A new invitee can interrupt authentication, confirm email if required, reopen
  the app/browser, and resume the intended invitation on the same platform.
- Browser storage does not transfer to a newly installed app. Preserve an
  explicit reopen-original-link or paste-link/code recovery path.
- Retain pending invitation context through transient failures. Clear it only
  after successful joining or explicit cancellation/replacement; avoid races
  where an older attempt clears a newer invitation. Validate stored data.
- Parse the supported HTTPS and custom-scheme invite forms consistently,
  including query/fragment suffixes and malformed input.
- Separate auth loading, profile loading/error, authenticated/no chapter,
  pending, approved, rejected/removed, and different-chapter states.
- Keep sign-out, support, invitation recovery, and password recovery reachable
  where appropriate. No redirect loops or premature empty-chapter screens.
- Reopening an invite for one's already-approved chapter is safe and idempotent
  from the user's perspective. Preserve one-chapter-per-account enforcement.
- A removed/rejected member cannot reapprove themselves using any chapter invite.
- Supply an explicit admin-only reinstatement path with same-chapter checks,
  proper server authorization, and no automatic restoration of admin privileges.
  If a small admin UI addition is necessary to make this path usable, it belongs
  in this slice. Keep broader admin redesign out of scope.
- Full organization name, chapter designation when available, and university
  remain recognizable through joining. Use chapter-inclusive language.
- Differentiate temporarily unavailable invite resolution from an invalid,
  revoked, or expired invite; offer useful retry or recovery.

### Files to inspect and likely edit

- `lib/invite.ts`, `lib/auth.tsx`, `lib/links.ts`, `lib/types.ts` if needed.
- `app/_layout.tsx`, `app/join/[code].tsx`, `app/login.tsx`, `app/signup.tsx`.
- `app/onboarding/enter-code.tsx`.
- `lib/admin.ts`, `app/admin/members.tsx`, `app/admin/approvals.tsx` as needed
  for a narrow, usable reinstatement flow.
- Existing `__tests__/lib/invite.test.ts`, `__tests__/lib/admin.test.ts`,
  `__tests__/lib/links.test.ts`.
- `supabase/tests/p0-authorization-invites.sql`.
- New membership-state screen and focused route/component tests if useful.
- New migration, proposed name `supabase/migrations/app-v9-pilot-reinstatement.sql`;
  check the current migration inventory before choosing the next name.
- `supabase/migrations/README.md` for the new migration's unapplied status and
  operator verification procedure; this plan for progress.

Read V6/V7/V8 and both SQL acceptance suites before editing authorization.
Do not edit the applied migration files. Draft the fix as a new migration with
explicit privileges, fixed search path, and preserved authorization boundaries.
Do not weaken existing RLS, membership controls, or block behavior to fix routing.

### Acceptance checks

- Web persistence, native persistence, restart, confirmation round trip,
  storage unavailable, retry, explicit cancellation, and stale-invite replacement.
- HTTPS/custom-scheme/raw-code parsing, invalid/revoked/expired invitation,
  service outage, and malformed stored state.
- Existing same-chapter member, different chapter, pending, removed, no profile,
  delayed profile read, failed profile read, logout, and password recovery.
- Removed member's valid invite cannot restore membership; valid new member can join.
- Non-admin and cross-chapter admin cannot reinstate; authorized same-chapter
  admin can; no admin privilege is restored incidentally.
- No unauthorized content briefly appears during membership transitions.
- Typecheck, focused regression tests, full existing Jest suite, and lint.
- Review the diff and document deployment ordering/old-client compatibility.
- SQL tests may write fixtures even when they roll back. Execute them only
  against a confirmed disposable local test database, never production.
- If no local database/device is available, report those checks as unexecuted.
  Mock tests are not live-policy verification.

Definition of done: code and migration draft are reviewable; local checks pass;
the above behavior is covered as far as the local environment supports;
unexecuted SQL/device checks and rollout requirements are explicit. Production
must still be unchanged. Do not mark the live policy corrected merely because
a migration file was written.

## Later slices: findings and touchpoints

### Map consent

Both `app/profile/edit.tsx` and `app/onboarding/complete-profile.tsx` automatically
geocode the city. If a changed city fails geocoding, old coordinates can survive.
`lib/queries.ts` shows alumni with coordinates, and `app/map.tsx` separately
renders the current user's coordinates. Consent must cover both paths.
Absent coordinates can represent not shared for a minimal pilot implementation;
prior stored coordinates require an explicit transition plan, not presumed consent.
Also inspect `lib/profile.ts`, `lib/geocode.ts`, and profile-completeness nudges.

### Chat reliability

`app/(tabs)/chats/[channelId].tsx` clears its draft before `lib/chat.ts` confirms
the insert. Return a useful result and preserve recoverable text. Account for
ambiguous network outcomes before retrying. Do not add rich attachments here.

### Home, Me, and design system

Home suggestions and activity both reuse recent joins (`lib/queries.ts`).
`app/(tabs)/me.tsx` is primarily settings. `app/(tabs)/_layout.tsx` exposes six
tabs for admins. Relevant components include MemberCard, NextEventCard,
ProfileNudgeCard, InviteCard, Button, Card, ScreenHeader, TextField, Chip,
SegmentedControl, and Avatar.

Keep system typography; standardize title/body/metadata hierarchy and 4-point
spacing. Use navy primary actions and gold accents. Measured contrast: gold
against cream 3.65:1; tertiary text against cream 2.85:1; navy against cream
12.86:1. Improve small essential text to at least 4.5:1. Support enlarged text,
adequate targets, labeled icon actions, and Reduce Motion. Use stable loading,
true empty, filtered empty, stale content, and retryable error states.

`components/ProfileNudgeCard.tsx` and profile setup say "brothers"; change to
chapter-inclusive language. Avoid requiring optional location for completion.
Profile detail/job poster `select('*')` queries should be minimized. Avatars use
public URLs; do not claim every profile asset is chapter-private without changing
storage accordingly in a separately reviewed implementation.

### Events, People, Jobs

`lib/events.ts` already fetches counts and viewer status. Failed RSVP reads
currently become zeros. Upcoming events include the prior 24 hours and Home
chooses `events[0]`, allowing ended events to lead. Serialize RSVP changes and
preserve loaded content. Native date/time inputs and explicit timezone display
belong in `app/events/new.tsx` and `app/events/edit/[id].tsx`.

People's mentor shortcut can stay on the Jobs segment, and mentor filter state
is initialized only on mount. Directory filtering searches loaded pages only.
Inspect `app/(tabs)/people.tsx`, `lib/queries.ts`, and `lib/jobs.ts`.
Jobs need clear closed/no-apply-link states. Simple Share to chat needs an
explicit channel choice, navigable link rendering, and authorization checks;
current chat bodies are plain text. Event-update push is not currently handled
by `supabase/functions/send-push/index.ts`.

## Distribution and QA

- Chapter links and TestFlight installation links are different. Current shared
  copy contains web/custom-scheme links but no TestFlight installation path.
- Ordinary members cannot retrieve an invite through the admin-only invite RPC;
  Home hides InviteCard at 15 members. Keep distribution steward-led initially.
- Give each chapter an active-member lead and alumni lead. Confirm alumni
  designations and have responsive mentors, a real event, and a welcome thread.
- Measure invited, installed, joined, useful action within 48 hours, and returned
  within seven days, per chapter. A manual steward log is sufficient initially.
- Universal Links are a later hosting/native-configuration decision; they do
  not transfer browser state through installation or replace TestFlight setup.
- Verify on the exact candidate build using small/large iPhones, enlarged text,
  VoiceOver, Reduce Motion, keyboard-open forms, long names, missing photos,
  slow/offline networks, and empty chapters.
- Verify push, cold-start routing, denial, and sign-out on physical devices.
- Capture loaded, empty, loading, and error states of each primary screen.
- Reconcile `docs/STATUS.md`, `docs/LAUNCH_RUNBOOK.md`,
  `docs/APP_STORE_CHECKLIST.md`, `RELEASE_OPERATOR_CHECKLIST.md`, and README
  against verified reality before release. Do not overwrite unknowns as done.

## Progress log

### 2026-09-16 — Audit and handoff

- User accepted audit direction and requested a fresh-session implementation prompt.
- Saved this plan and `docs/SESSION_1_PROMPT.md`.
- No application code or migrations changed; no production actions taken.
- Next: run the saved prompt in a new chat using this same local workspace.

For later entries record: slice, changed files, checks/results, checks not run,
migration drafted/applied status, remaining risks, and the next bounded action.


### 2026-09-16 — Slice 1: safe, recoverable chapter entry (local completion)

**Behavior implemented**

- Pending invites persist in native SecureStore or browser localStorage, using
  validated versioned records. Legacy native raw codes remain readable. Reads
  never consume an invite. Successful joining or explicit cancellation clears
  only the expected revision; replacement and stale async completion are
  guarded. Storage failures retain an in-memory retry and show instructions to
  keep/reopen the original link; failed deletion warns that it may reappear.
- Invitations are captured when opened, including during auth restoration.
  Login/signup preserve the context before authentication. Signup with email
  confirmation asks the user to confirm, return, and log in. Auth is the sole
  owner of automatic post-login routing; delayed reads are canceled after
  route/account changes. A new link resets the previous chapter preview.
- Auth loading, profile loading/failure/missing, pending, approved, and removed
  states are distinct. Protected screen children do not mount until approved.
  Profile responses cannot overwrite a newer session; foreground/focus
  rechecks membership. Membership help exposes retry, saved-invite review,
  cancellation, paste-code recovery, support, sign-out, and password reset.
- Join/login/signup retain organization name, designation, and university.
  Invalid/revoked/expired invites are distinguished from temporary preview
  failures. Wrong-chapter, pending, and removed states explain their recovery
  path without attempting a join. Approved same-chapter reopening is safe.
  Profile setup now says “chapter members.” Browser-to-install recovery is
  explicitly manual: reopen the original invitation or paste its code/link.
- Password recovery stays reachable regardless of profile state. Native/web
  reset callbacks accept the supported implicit-token or PKCE form; browser
  tokens are removed from history after exchange. No redirect settings were
  changed. Me received only sign-out error handling, not a redesign.
- Admin Members has a removed/declined list and explicit confirmation for
  reinstatement. It calls only the new server RPC and reports failure without
  falling back to a profile update or ordinary approval.

**Changed files**

- Invitation/auth/routing: `lib/invite.ts`, new `lib/pending-invite.ts`,
  `lib/links.ts`, new `lib/entry.ts`, `lib/auth.tsx`, new `lib/auth-links.ts`,
  `app/_layout.tsx`, `app/join/[code].tsx`, new `app/membership.tsx`,
  `app/login.tsx`, `app/signup.tsx`, `app/forgot-password.tsx`,
  `app/reset-password.tsx`, `app/onboarding/enter-code.tsx`,
  `app/onboarding/complete-profile.tsx`, new `components/InvitationContext.tsx`,
  and the narrow sign-out handler in `app/(tabs)/me.tsx`.
- Admin/policy: `lib/admin.ts`, `app/admin/members.tsx`, new
  `supabase/migrations/app-v9-pilot-reinstatement.sql`, and
  `supabase/tests/p0-authorization-invites.sql`. Applied V6/V7/V8 files and
  `supabase/tests/p0-membership-blocks.sql` are unchanged.
- Tests: updated `__tests__/lib/{invite,links,admin}.test.ts`; added
  `__tests__/lib/{pending-invite,invite-storage,entry,auth-links}.test.ts`,
  `__tests__/lib/auth.test.tsx`, and
  `__tests__/components/chapter-entry.test.tsx`.
- Documentation: this progress log and `supabase/migrations/README.md`.
  The existing untracked handoff documents were preserved; no commit was made.

**Executed local verification**

- `npm run typecheck`: passed.
- Focused entry/auth/invite/admin regressions: **9 suites / 92 tests passed**.
- `npm test -- --runInBand`: **19 suites / 211 tests passed**. The existing
  non-fatal Expo Go push warning appears in the events suite.
- `npm run lint`: passed, **0 errors / 26 warnings** (baseline: 27 warnings).
- Final source diff reviewed; `git diff --check` passed. V6/V7/V8 have no diff.
  Expo's installed local route-type generator refreshed ignored `.expo/types`
  for the new route; no dev server, bundle, build, or live backend was used.
- Local component tests use a mocked backend/router/native UI services and
  test actual join/recovery/admin interactions, delayed redirect cancellation,
  non-mounting protected children, and explicit reinstatement confirmation.
  Platform adapter tests exercise both iOS SecureStore and browser localStorage
  selection with mock storage. They do not establish installed-device behavior.

**Unexecuted verification and rollout requirements**

- **V9 remains a draft and is unapplied. The live removal policy is not fixed
  by this local work.** No production database reads/writes, remote migrations,
  EAS changes, credentials/env changes, builds, deployments, commits, or pushes
  occurred. No messages were sent to other people.
- No confirmed disposable local database was available (`psql` and Docker
  were absent from PATH). Both SQL acceptance suites remain **unexecuted**.
  The authorization suite intentionally replaces the old rejected-member
  rejoin expectation with denial. It adds owner/manager success, unauthorized
  and cross-chapter denial, pending-review preservation, revoked/expired
  invites, idempotent approved joining, and admin/designation/block checks.
- Native device/simulator and real browser UI, real email confirmation/reset,
  auth redirect allowlist/hosting, cold/warm OS link delivery, and exact-build
  QA remain pending. Decorative icons and native services are mocked in UI
  tests; no live Supabase credentials were used for verification.
- Future separately authorized order: bootstrap a disposable local database
  through V8 → apply V9 there → run **both** SQL suites → verify web/native
  journeys against that local backend → approve deployment → apply V9 before
  client distribution → exact-build/browser verification before expanding
  pilot invitations. Do not rerun V6/V7/V8 over V9.
- Old clients are server-protected only after V9 is deployed and may show
  generic denial copy; they lack reinstatement UI. The new client on V8 alone
  does not secure old clients and its reinstatement action fails closed until
  the new RPC exists. Reinstatement deliberately does not restore admin roles.
  Browser storage cannot transfer to an installed app, and unavailable storage
  cannot guarantee restart persistence. Full operator steps and the admin
  reinstatement path are in `supabase/migrations/README.md`.

**Next bounded work:** Slice 2, explicit map consent, is next in the accepted
implementation order and was not started. Complete the pending Slice 1 SQL
and physical-device/browser release checks before expanding invitations.

### 2026-09-16 — Slice 1 independent review

This entry supersedes the immediate next action above: correct the two review
findings before proceeding to Slice 2. See `docs/SLICE_1_REVIEW.md` and
`docs/SESSION_1_FOLLOWUP_PROMPT.md`.

- Source review confirms the planned platform-specific invitation persistence,
  membership routing, recognizable chapter identity, and server-only reinstatement
  implementation. This is not a live-policy or device sign-off.
- Independently reran typecheck (passed), all 19 Jest suites / 211 tests (passed),
  and `git diff --check` (passed). Lint was not rerun during this review; the
  implementation session reports 0 errors / 26 warnings.
- Added two diagnostic tests only in a temporary directory outside the repository,
  using the existing chapter-entry mock harness. Both fail against current code:
  (1) a protected screen loses its draft after ready → loading → ready membership
  refresh; (2) explicit cancellation during the initial invitation save does not
  clear the eventual saved revision. Details and acceptance criteria are in the review.
- No application code, tests in the repository, migrations, EAS settings, or
  production state changed during review. Only review/handoff documents changed.
- V9 and both SQL suites remain unexecuted; native/browser verification remains
  pending. Do not deploy or distribute based on passing unit tests alone.
- Next action: return to the Slice 1 implementation chat with the follow-up prompt,
  fix these two cases, add permanent regressions, rerun local checks, and bring
  the completion summary back for review.


### 2026-09-16 — Slice 1 review corrections (local completion)

This entry supersedes the independent review's immediate correction task. Both
findings in `docs/SLICE_1_REVIEW.md` were reproduced with permanent failing tests,
corrected, and verified locally. Slice 2 was not started.

- **Membership revalidation:** retain the same account's last profile and block
  state across foreground/browser-focus and same-account auth events. Keep
  private screen/tab state mounted but hidden, non-interactive, and excluded from
  accessibility while membership is loading or has a retryable read error. Keep
  initial loading fail-closed. Do not redirect away on a retained-profile error.
  Confirmed rejection/missing membership, logout, and account switching discard
  prior private state; obsolete profile responses cannot restore it.
- **Pending invitation cancellation:** retain the save promise independently of
  React's saved-record state. Await it before revision-specific cleanup, including
  after unmount. Suppress stale UI/navigation completion and duplicate actions.
  Preserve newer B or A→B→A revisions. Persistence failure warnings remain explicit;
  a device store that cannot delete cannot guarantee durable removal.
- **Changed source files:** `lib/auth.tsx`, `lib/entry.ts`, `app/_layout.tsx`,
  `app/join/[code].tsx`. **Permanent regressions:**
  `__tests__/lib/auth.test.tsx`, `__tests__/components/chapter-entry.test.tsx`.
  **Documentation:** this log and `docs/SLICE_1_REVIEW.md`. All other prior changes
  and the review/handoff prompts were preserved; migrations/SQL suites were not
  edited in this correction.
- **Executed checks:** typecheck passed; focused tests **4 suites / 74 passed**;
  full Jest **19 suites / 232 passed**; lint **0 errors / 26 warnings**;
  follow-up diff reviewed and `git diff --check` passed. The two core regressions
  failed before correction and now pass. The events suite still emits the existing
  non-fatal Expo Go push warning.
- **Coverage:** actual AuthProvider/ScreenAccess with mocked services and stateful
  inputs across AppState background/active (including photo-picker return), browser
  focus, same-account token/sign-in/user-update events, failure/retry and eventual
  rejection/missing membership, logout/account-switch stale responses, and block
  continuity. Cancellation tests use controlled storage operations and fresh store
  instances to check restart outcomes, unmount, failures, and replacements.
- **Remaining gates:** V9 is **unchanged and unapplied**; neither SQL suite was
  executed. Real-device/browser QA and disposable-database acceptance remain
  required before separately authorized release. Add focused manual checks for
  actual photo picking, keyboard/focus, nested navigation state, accessibility
  during hidden revalidation, membership removal, and delayed-storage cancellation.
  These mocked tests do not sign off live authorization or device behavior.
- **Rollout ordering unchanged:** disposable local V8 baseline → V9 and both SQL
  suites locally → native/browser verification → separate deployment approval →
  V9 before client distribution. No production, remote SQL, builds/deployments,
  EAS/credentials/env changes, commits, or pushes occurred.
- **Next bounded action:** independent review of the correction handoff and the
  outstanding Slice 1 verification gates. Slice 2 remains unstarted.

### 2026-09-16 — Slice 1 corrections independently accepted locally

- Reviewed the corrected AuthProvider/ScreenAccess lifecycle and invitation
  cancellation, plus their permanent regressions. Both prior findings are resolved
  within the tested local behavior; no further blocking finding identified in this
  focused follow-up review.
- Independently reran typecheck (passed), full Jest (19 suites / 232 tests passed),
  and `git diff --check` (passed). Lint was not rerun in this review; the correction
  session reports 0 errors / 26 warnings. V6/V7/V8 still have no source diff.
- No application, test, or migration changes made during this review. Updated
  review/plan documentation and prepared `docs/SESSION_2_PROMPT.md`.
- Local acceptance is not release approval. V9 remains unapplied; both SQL suites,
  real browser/native navigation, actual photo-picker return, keyboard and
  accessibility behavior, email recovery, and exact-build QA remain outstanding.
- Next: a fresh implementation chat can implement Slice 2 locally using its saved
  prompt. Carry Slice 1's pending gates forward; do not mark them complete or
  authorize deployment by beginning the next slice.


### 2026-09-16 — Slice 2: explicit map consent (local completion)

**Behavior implemented**

- Edit profile and profile setup separate optional chapter-visible city from an
  explicit map-sharing switch. Default/missing/legacy consent is off, regardless
  of stored coordinates. Copy explains approximate city-level visibility to
  approved chapter members, admin-controlled alumni eligibility, no GPS/live
  tracking, and turning sharing off with Save while retaining the profile city.
  Onboarding remains skippable. City and map participation no longer contribute
  to profile completeness; its chapter-inclusive copy otherwise stays scoped.
- Sharing-off saves perform no geocoding. Sharing-on alumni saves first persist
  city/consent and clear the old pin, then save other valid profile edits, look
  up the city, and conditionally publish its coordinates. Cleared city disables
  sharing. Lookup failure/no result/missing token/timeout leaves coordinates
  cleared and reports that the profile/city saved but the pin did not. A five
  second deadline works even if the transport ignores abort. Coordinate ranges
  are checked. Active members can save consent without geocoding or a pin;
  after admin designation, another Save is required to publish a city location.
- Server revision checks cover both the initial setting save and final lookup
  completion. Later opt-out, changed city, membership/status/chapter transitions,
  and completed lookups invalidate obsolete writes. Forms serialize saves and
  disable city/consent changes during a save; unmounted forms cannot submit late
  lookup results or navigate. A background profile refresh cannot pair stale
  form consent with a newer server revision. Confirmed partial saves permit a
  lookup retry; ambiguous/stale saves tell the member to reopen the form.
- Other valid profile edits can save if consent support is unavailable or map
  persistence fails, with explicit partial-save feedback. A failed initial map
  write does not claim an opt-out succeeded: previous settings may remain.
  Missing V10 support disables sharing and map pins without a direct-coordinate
  fallback; city/map saves require V10. Profile writes detect zero affected rows.
- Peer queries, the separately rendered self pin, and network map counts all
  require explicit consent, approved alumni status, city, and valid coordinates.
  The map reloads on focus, clears cached peer pins during refresh or errors,
  and retains existing block/chapter filters. The server does not retract data
  already cached on another device; subsequent reads/writes enforce the policy.

**Storage transition and compatibility**

- New **`supabase/migrations/app-v10-explicit-map-consent.sql` is a draft and
  UNAPPLIED**. It adds default-false consent and server-managed revision fields,
  clears all legacy coordinates while preserving profile cities, and adds the
  two owner-only approved-member RPCs, invalidation trigger, coordinate/consent
  constraint, explicit privileges, fixed search paths, and grant checks.
  There is no automatic opt-in or production backfill. V10 intentionally rejects
  reruns rather than resetting later user consent. V9 is byte-for-byte unchanged.
- Direct client coordinate/consent/revision writes are denied. Old clients that
  automatically include coordinates in profile saves will receive a save error
  for the entire write; they cannot restore a pin after opt-out. Old city-only
  changes remain self-editable and invalidate the previous pin. Existing RLS,
  symmetric blocks, membership/admin designation, and chapter boundaries remain.
- V6/V7/V8 remain unchanged; V9 remains unapplied. The current authorization SQL
  suite now requires V10: only its ordinary-coordinate grant/write expectations
  changed, preserving every Slice 1 assertion. The V8 block suite is untouched.
  Starting or completing local Slice 2 does not establish a live privacy fix.

**Changed files**

- Forms and map: `app/profile/edit.tsx`, `app/onboarding/complete-profile.tsx`,
  `app/map.tsx`, new `components/MapConsentField.tsx`, and
  `components/ProfileNudgeCard.tsx`.
- Data helpers: `lib/profile.ts`, `lib/geocode.ts`, new `lib/map-consent.ts`,
  `lib/queries.ts`, and `lib/types.ts`.
- Tests: new `__tests__/lib/profile-map.test.ts`,
  `__tests__/lib/map-query.test.tsx`, `__tests__/components/profile-map.test.tsx`,
  and `__tests__/components/map-consent.test.tsx`; updated
  `__tests__/lib/geocode.test.ts` and `__tests__/components/completeness.test.ts`.
- SQL/docs: new V10 migration and `supabase/tests/pilot-map-consent.sql`, narrow
  updates to `supabase/tests/p0-authorization-invites.sql`,
  `supabase/migrations/README.md`, and this plan. All pre-existing Slice 1 work
  and handoff/review documents were preserved. Previously modified files outside
  the listed overlap were checked against pre-session hashes and are unchanged.

**Executed local verification**

- `npm run typecheck`: passed.
- Focused save, geocoding, completeness, query, form, and actual map-rendering
  regressions: passed with mocked backend, geocoder, router, and native map UI.
  Coverage includes default-off legacy coordinates, opt-in/off and reopening,
  blocked/cross-chapter rows, missing API/schema, stale responses, failed writes,
  independent profile fields, hidden self pin, active designation, and Skip.
- `npm test -- --runInBand`: **23 suites / 283 tests passed** (51 additional
  tests over Slice 1). All Slice 1 auth/draft/cancellation regressions still pass.
  The existing non-fatal Expo Go push warning remains in the events suite.
- `npm run lint`: **0 errors / 26 warnings**, unchanged from Slice 1.
- Final source/migration diff reviewed and `git diff --check` passed. No
  production, remote backend, real Mapbox lookup, EAS/env/credentials, dependency
  changes, builds, deployments, commits, pushes, or messages to others occurred.

**Unexecuted gates and future order**

- `psql` and Docker are absent from PATH; no confirmed disposable local database
  was available. **All three SQL suites are unexecuted**, including the new
  consent suite's RPC, legacy-client, revision, designation, block, and chapter
  assertions. Mock tests are not SQL-policy or migration verification.
- Real native/browser UI, device restart, installed Mapbox rendering, keyboard,
  enlarged text/VoiceOver, photo-picker return, and concurrent real-client saves
  remain unverified. All prior Slice 1 email/link/auth and exact-build gates remain.
- Separately authorized sequence: disposable base schema/V1–V8 → V9 → seed a
  legacy city/coordinates fixture → V10 → verify default-off reset with retained
  city → all three SQL suites and concurrent-session races → local-backend
  native/browser journeys → independent review/deployment approval → V9 then V10
  before client distribution → exact-build QA before expanding pilot invitations.
  Coordinate older-client replacement because direct-coordinate saves will fail.
  Never reapply V6–V9 over V10 or restore legacy coordinates as a rollback.

**Implementation handoff at completion:** independent review of Slice 2 and its
migration/compatibility plan. The review outcome is recorded below.

### 2026-09-17 — Independent Slice 2 review

- Accepted locally; no new blocking client issue identified. Review evidence and
  remaining gates are in `docs/SLICE_2_REVIEW.md`.
- Independently rerun: typecheck, 23 suites / 283 tests, and diff checks passed.
  Lint was not rerun; implementation reports 0 errors / 26 warnings.
- V9/V10 remain unapplied. Legacy-coordinate reset, older-client profile-save
  incompatibility, all three SQL suites, and native/browser QA remain release
  considerations; local acceptance does not close them.
- Only review and handoff docs changed in this review. No application/migration
  edits, production access, deployment, commit, or push.
- Next bounded local implementation: Slice 3 message reliability, including the
  equivalent mentorship draft/send risk, using `docs/SESSION_3_PROMPT.md`.
  Slice 3 is not started. No rich cards, offline queue, or chat redesign.

### 2026-09-17 — Slice 3: reliable text sends (local implementation)

**Implemented behavior and retention boundary**

- Chapter chat and accepted mentorship conversations share a text composer and
  send lifecycle. A synchronous guard permits one unresolved logical send per
  conversation. Submitted trimmed text moves atomically into a visible recovery
  preview, with Sending, failed, or unconfirmed feedback. Newer typing lives in
  a separate draft and is never cleared/restored by an older completion. Send
  errors do not replace loaded history or become thread-load errors. Both
  screens retain load-error recovery independently of their composer.
- Retry retains the original UUID, sender, conversation, and immutable content.
  Every attempt first reads the parent conversation through current server RLS
  (including accepted-mentorship participant checks), then looks up the exact
  message ID. INSERT also remains subject to current RLS. Only an acknowledgment
  or authorized read matching ID + conversation + sender + content confirms the
  send. Conflicts alone, empty/malformed acknowledgments, thrown failures, and
  lost responses never mean delivery. There is no upsert or text/time dedupe.
  An intentional subsequent message, including identical text, gets a new UUID.
- INSERT errors/empty responses receive an exact-ID reconciliation read. An
  unresolved send remains retryable; a previously uncertain attempt stays
  uncertain even if a later attempt is denied. The 15-second total attempt
  deadline stops indefinite pending UI. A late timed-out request may still
  commit on the server, but cannot settle a newer run or dispatch further reads/
  writes after invalidation. An explicit retry or authorized realtime/history
  read reconciles it. UUID preparation failure leaves the draft in place.
- Drafts and pending/failed/uncertain identities live **only in this app process
  or browser page's memory**, isolated by account and conversation kind/ID.
  They survive ordinary navigation away/back, same-account auth events, and
  membership revalidation loading/errors. Nothing sends automatically on
  reopening. App termination, browser reload, or a separate browser tab has no
  draft recovery. No disk storage or general offline queue was added.
- Logout, account switch, confirmed missing/non-approved membership, or chapter
  change clears recovery and invalidates all old callbacks. An authorized read
  proving a conversation unavailable clears its private recovery; an explicit
  reload can check newly restored access with a fresh empty entry. Loss of
  accepted mentorship status clears its send state. These privacy transitions
  intentionally take precedence over retaining inaccessible text.
- Retry/Send have accessible labels, readable status copy and 44-point targets.
  The submitted preview is selectable and scrollable. Explicit Discard confirms
  removal of only the saved attempt, leaves newer typing intact, and warns that
  it does not delete a message that may have been sent. No rich cards, generic
  DMs, chat redesign, notification changes, or later slices were implemented.
- Both thread hooks use a shared lifecycle to guard history, realtime reads,
  pagination, sender-profile reads, and response adoption by account/entry and
  mount lifetime. Realtime INSERTs are re-read through RLS; rows merge by ID;
  delayed snapshots preserve intervening confirmations/events. A fresh successful
  reload replaces its snapshot while preserving arrivals during that read.
  Channel pagination remains 50 rows with the existing fetched-time cursor;
  mentorship keeps its existing history query. Reactions, reporting, blocking,
  acceptance controls, and sender/admin deletion remain in place. Observed
  deletions suppress stale fetched rows and terminate retry of that identity.

**Files changed in this slice**

- Screens: `app/(tabs)/chats/[channelId].tsx`, `app/inbox/[requestId].tsx`.
- Shared composer: new `components/MessageComposer.tsx`.
- Sending/recovery/history: new `lib/message-send.ts`, `lib/message-recovery.ts`,
  `lib/message-thread.ts`; `lib/chat.ts` and `lib/mentorship.ts` delegate their
  thread lifecycle to these helpers. UUIDs use the already-installed Expo
  modules-core native/web generator; no package/dependency changes.
- Auth integration: `lib/auth.tsx` adds only an import and two lifecycle calls
  to set the recovery account and confirm membership. The Session 1 profile,
  routing, pending-invite, and revalidation changes were preserved.
- Tests: new `__tests__/lib/message-send.test.ts`, `message-recovery.test.ts`,
  `message-thread.test.tsx`, `message-auth.test.tsx`; new
  `__tests__/components/message-composers.test.tsx` and local query/response
  controls in `__tests__/helpers/message-db.ts`. Existing test files unchanged.
- SQL: new `supabase/migrations/app-v11-message-retry-identities.sql` and
  `supabase/tests/pilot-message-retries.sql`. Migration/rollout notes appended
  to `supabase/migrations/README.md`; progress recorded here.

**Migration rationale and compatibility**

- V1 declares the channel-message UUID primary key; V6 grants message INSERT/
  SELECT and keeps identity/content immutable to clients. V7 does not change
  message grants; V8 enforces chapter/channel/accepted-participant and symmetric
  block rules. The base mentorship table DDL is absent from the repository,
  so its actual primary-key shape still needs disposable-schema verification.
- Existing primary keys prevent simultaneous duplicate rows but are released by
  physical deletion. A commit/lost-response/admin-delete/retry sequence could
  therefore recreate a moderated message. **V11 is a required, unapplied draft**
  for that case: an inaccessible-to-clients ledger reserves only table + message
  UUID atomically with INSERT and retains it after DELETE. It backfills existing
  messages and rejects reused identities without changing message grants/RLS.
  A conflict after deletion remains unconfirmed; the client cannot inspect the
  ledger or use it as delivery evidence. No content or account metadata is kept
  in the ledger, and no broader update permissions are introduced.
- V11 explicitly aborts without the assumed single-column UUID primary keys.
  Backfill/trigger installation holds write-blocking table locks for its
  transaction. Older clients using server-default UUIDs remain compatible, but
  their old retry behavior is unchanged. V9/V10's existing compatibility costs
  still apply. V11 must precede distribution of this client; do not drop its
  triggers/prune IDs while a client can still retry. V1–V10 were not edited.

**Local verification and open gates**

- `npm run typecheck`: passed.
- Focused send/recovery/thread/AuthProvider/actual-screen regressions:
  **5 suites / 98 tests passed**. These use controlled local mocks, including
  server commit/lost response, concurrent duplicate inserts, physical deletion,
  both realtime orderings, duplicate events, delayed snapshots/history,
  thrown/denied/empty acknowledgments, timeout, newer typing, explicit retry,
  navigation, revalidation, account changes, membership loss, and acceptance loss.
- `npm run lint -- --format json --output-file /tmp/greekties-session3-lint.json`:
  **0 errors / 24 warnings** (recorded prior baseline: 26 warnings).
- `npm test -- --runInBand`: **28 suites / 381 tests passed**, including every
  previous Slice 1/2 regression. The existing non-fatal Expo Go push warning
  remains in the events suite.
- `git diff --check` and explicit whitespace checks for new untracked files:
  passed. Final source/SQL diff reviewed. Local baseline comparison confirms
  **52 of 55** previously changed/untracked files remain byte-for-byte identical;
  the exceptions are exactly three additive lines in `lib/auth.tsx`, the status/
  progress updates in this plan, and append-only migration README notes.
  Existing tests, Session 1/2 review/handoff files, and V1–V10 are preserved.
  No package/lockfile, environment, build, or remote-state changes were made.
- `psql` and Docker are absent from PATH. No confirmed disposable database was
  available. **All four SQL acceptance suites remain unexecuted.** The new suite
  covers identity uniqueness/immutability, authenticated read/write boundaries,
  old-client default IDs, deletion non-resurrection, reservation rollback after
  denial, and membership/channel/participant/symmetric-block checks. Mocked
  uniqueness and permission tests are not actual PostgreSQL/RLS verification.
- Native/browser UI, VoiceOver/enlarged text, keyboard/scroll behavior, slow/offline
  network transitions, foregrounding, and actual realtime subscription behavior
  remain unverified. Two real concurrent local SQL connections and exact-build
  QA remain required. All prior Slice 1/2 invite/auth/map gates stay open.
- No remote DB reads/writes, credential reads, migration application, EAS/env
  changes, builds, deployment, commits, pushes, merges, or external messages.

**Next bounded action:** independent review of Slice 3's local source, recovery
semantics, and V11/SQL acceptance draft. Resolve any review findings before
starting Slice 4. Separately establish a disposable base schema, execute V9 →
V10 → V11 in the documented sequence and all four SQL suites plus concurrent
races, then perform local-backend native/browser QA. Production changes and
client distribution require separate authorization; this implementation is not
release approval.

### 2026-09-17 — Independent Slice 3 review

- One P2 correction required before local acceptance: Discard saved message uses
  `Alert.alert`, which is a no-op in the installed web package. An unresolved
  attempt can keep new sends disabled with no working discard action. Both
  chapter and mentorship screens are affected.
- Evidence and scoped correction requirements: `docs/SLICE_3_REVIEW.md`.
- Independently rerun: 28 suites / 381 tests, typecheck, and diff checks passed.
  Two temporary diagnostic tests reproduce the missing web confirmation using
  the actual screen components and installed web Alert implementation. These
  component diagnostics are not a real-browser run.
- Lint was not rerun; implementation reports 0 errors / 24 warnings. All four
  SQL suites and native/browser QA remain open; V9/V10/V11 remain unapplied.
- Only review/handoff documentation changed. No application/migration edits,
  production access, deployment, commit, or push.
- Next bounded action: send `docs/SESSION_3_FOLLOWUP_PROMPT.md` to the Slice 3
  implementation chat, then bring its correction summary back for review.
  Do not start Slice 4 until this correction is independently accepted.

### 2026-09-17 — Slice 3 follow-up: actionable web/native discard

- Implemented `docs/SESSION_3_FOLLOWUP_PROMPT.md` locally. The original finding
  and correction evidence are retained in `docs/SLICE_3_REVIEW.md`; independent
  acceptance is still pending. **Slice 4 remains on hold.**
- `components/MessageComposer.tsx` now renders inline Cancel/Discard confirmation
  on every platform. It explains that discard removes local recovery only and
  neither deletes a possibly sent message nor cancels an in-flight server send.
  Cancel preserves both texts; confirm discards only the intended attempt while
  preserving newer typing and allowing the next deliberate send.
- Confirmation state is scoped to the conversation/account/message identity,
  immutable attempt snapshot, and mounted component. Snapshot/current-entry
  checks reject stale actions across cancellation, retry (including the same ID
  returning to failed/uncertain), late settlement/replacement, navigation,
  unmount, logout, account switch, and confirmed membership loss. Existing store
  identity guards, stable retry IDs, and server authorization remain unchanged.
- Added 54 permanent actual-screen regressions in
  `__tests__/components/message-composers.test.tsx`. Both conversation kinds run
  under web/iOS/Android configurations; web tests substitute the installed web
  Alert implementation and press actionable rendered confirmation controls.
  The initial direct-control tests failed before the correction; all now pass.
- Verification: actual-screen suite **63 tests**; focused Slice 3 suite
  **5 suites / 152 tests**; full suite **28 suites / 435 tests**. Typecheck and
  diff/whitespace checks pass. Lint: **0 errors / 24 warnings**. The pre-existing
  non-fatal Expo Go push warning remains. No existing regression was removed.
- Scope/preservation check: only the shared composer, its test file, this plan,
  and the Slice 3 review changed from the follow-up baseline. Other Slice 1–3
  work, recovery/transport code, V9–V11, SQL acceptance files, dependencies, and
  unrelated Alert uses remain byte-for-byte unchanged.
- This is mocked component evidence, not a real browser/device journey. Manual
  keyboard, screen-reader, enlarged-text, and layout QA remains pending, as do
  all four SQL acceptance suites, concurrent sessions, and prior release gates.
  V9/V10/V11 remain unapplied. No credential reads, production/remote database
  actions, migrations, EAS/env changes, builds, deployments, commits, pushes,
  merges, or messages to others occurred.
- Next bounded action: independent review of this correction and its regression
  evidence. Do not begin Slice 4 until Slice 3 is independently accepted.

### 2026-09-17 — Independent Slice 3 correction acceptance

- The discard finding is resolved; Slice 3 is accepted locally. Inline controls
  work in the component tests, preserve newer typing, and reject stale actions
  against replaced attempts or invalidated conversation/account state.
- Independently rerun: 28 suites / 435 tests passed, typecheck passed, and diff
  checks passed. Lint was not rerun; implementation reports 0 errors / 24 warnings.
- Review recorded in `docs/SLICE_3_REVIEW.md`. Only documentation changed in
  this review; no code/migration edits, remote actions, commits, or pushes.
- Next bounded session: `docs/SESSION_3_QA_PROMPT.md` for local database and
  browser/device validation readiness and execution. Resolve actual environment
  and base-schema prerequisites without accessing production or inventing an
  authoritative schema. Then assess readiness to start Slice 4 visual work.
- V9–V11 remain unapplied. All four SQL suites, concurrent-session checks, and
  real native/browser QA remain open. Local acceptance is not release approval.

### 2026-09-17 — Owner selects Slice 4 before the validation session

- The owner explicitly chose to proceed with local Slice 4 in a fresh
  implementation chat. This supersedes the recommended next-session order
  above; it does not waive any SQL, concurrency, device/browser, or release gate.
- Saved `docs/SESSION_4_PROMPT.md`: useful Home sections from existing authorized
  events/jobs/conversations; Me profile hub with account settings below; five
  visible tabs and admin access in Me; mentorship discovery in Chats; restrained
  cream/navy/gold tokens, accessible controls, and honest loading/error states.
- Any Home event selection or People shortcut changes are narrowly limited to
  making these entry points accurate. Broader Events/People/Jobs work stays in
  Slice 5. No new backend feature or migration belongs in Slice 4.
- `docs/SESSION_3_QA_PROMPT.md` remains the saved validation handoff for later.
  V9–V11 remain unapplied and all four SQL suites remain unexecuted.
- Only handoff documentation changed. Next: run the Slice 4 prompt in a fresh
  implementation chat, then return its summary here for independent review.


### 2026-09-17 — Slice 4: Home, Me, and visual foundations (local implementation)

Implemented a bounded, independently recoverable Home overview (one genuinely
future event, two open jobs, latest available visible-channel message activity),
full chapter identity, notification/profile/network/optional-map access, and
admin-only invitation access through existing settings. Same-scope retry keeps
successful content; account/chapter/access/block changes invalidate cached data
and late responses. No fabricated activity or unread counts.

Me now centers existing profile details with Edit profile, the unchanged
city-independent completeness calculation, accurate map status and the existing
consent-form destination. Account controls follow the profile, with actionable
inline web/native deletion confirmation and sign-out/link error recovery. Admin
is reached from Me only for approved owners/managers. All roles see exactly
Home, Chats, Events, People, Me tabs. Chats exposes Mentorship conversations
without an unread badge. People handles repeated Jobs and existing mentor
shortcuts on a mounted tab; directory pagination/search are unchanged.

Shared changes retain cream/navy/gold, system typography and four-point spacing.
Buttons use navy/light text, wrapping labels and minimum touch targets;
decorative card borders stay subtle while control boundaries have measured
contrast. Metadata and accent colors were darkened; Button/Card press scaling
and Avatar transition were removed. Core entry, map consent and message-recovery
implementations were preserved. No V1–V11 or SQL file changed.

Changed: five tab screen/layout files, new `lib/home.ts` and `ReadStatus`, color
tokens, Button/Card/Avatar/TextField, focused actual-screen/mock-query tests,
and isolated QA scripts. Full file inventory and design/QA details are in
`docs/SLICE_4_IMPLEMENTATION.md`.

Checks: typecheck passed; new focused suite **28 tests**; full suite **29 suites /
463 tests**, including all 435 prior regressions; lint **0 errors / 26 warnings**;
`git diff --check` passed. The two new effect-state warnings and the existing
non-fatal Expo Go test warning are explained in the handoff. Measured essential
text contrast is at least **4.63:1** across the tested surfaces; primary button
text **12.86:1**; control boundaries at least **3.06:1**. Session-start file hashes
confirm prior migration/test/review/accepted core-behavior files are preserved.

An isolated static renderer generated 13 HTML fixtures from actual components,
with synthetic services, no backend access, and a restrictive CSP. Browser
connector unavailable; native Chrome inspection blocked on macOS computer-use
permissions. **No screenshots or completed visual QA claimed.** Small/large and
enlarged-text layouts, actual icons, focus/accessibility, map switches, chat
discard controls and five-tab/admin runtime navigation remain unexecuted visual
gates. See the handoff for fixture regeneration and evidence limitations.

This is local implementation ready for independent review, not independent
acceptance or release approval. V9–V11 are unchanged/unapplied; all four SQL
suites, concurrency checks, and prior browser/device gates remain open. No
production, credentials, migrations, dependency upgrades, builds, distribution,
commits, pushes, merges, external messages, or Slice 5 work.

### 2026-09-17 — Independent Slice 4 review

- Accepted locally for source and tested behavior; no new blocking code finding.
  Visual design approval remains pending. Review: `docs/SLICE_4_REVIEW.md`.
- Independently rerun: 29 suites / 463 tests, typecheck, diff checks, and lint
  (0 errors / 26 warnings) passed. Contrast measurements reproduced. The two
  new effect-state warnings are documented; no blocking loop was identified.
- Compared 66 protected files against the Slice 4 baseline inventory: unchanged.
  Only review/handoff documentation changed during this independent review.
- Browser tooling could not initialize (`CUA_REPL_ENABLED_SURFACES is required`);
  no screenshots or rendered visual QA were performed. Static fixture generation
  is not visual approval or real runtime navigation/accessibility verification.
- Recommended next session: `docs/SESSION_4_QA_PROMPT.md` for visual inspection
  before more visual implementation. `docs/SESSION_3_QA_PROMPT.md` retains the
  database validation handoff. Slice 5 remains unstarted.
- V9–V11 remain unapplied; all SQL/concurrency and native/browser release gates
  remain open. No remote access, deployment, code/migration edits, commit, or push.

### 2026-09-17 — Owner approves visual direction and selects Slice 5

- Owner states: "I like what I see and agree with the visual corrections lets
  proceed to slice 5." Record this as product/design approval and authorization
  to move to the next local slice, not evidence that technical visual/device or
  SQL checks were executed. No separate visual-QA report/correction list was
  present in the repository at this handoff; do not invent additional changes.
- Saved `docs/SESSION_5_PROMPT.md` for a fresh implementation session: reliable
  RSVP reads/writes and Interested wording; small attendance preview; clear
  event times; chapter-wide directory filtering; accurate job actions; simple
  event/job links reviewed in the existing channel composer before Send.
- Preserve Slices 1–4 and V1–V11. No rich cards, recurring groups, tagging,
  scheduling system, new backend feature, or deployment. A narrowly necessary
  Expo-compatible date/time input dependency may be added locally and documented;
  this does not authorize a native build, upload, or unrelated dependency upgrade.
- Only planning/handoff documents changed. Next: run the Slice 5 prompt in a
  fresh implementation chat, then return its summary for independent review.
  All previously recorded release gates remain open.


### 2026-09-17 — Slice 5: Events, People, Jobs and reviewed channel sharing

- Implemented locally; independent review remains pending. Full scope, exact
  changed/new files, count/time/search/share semantics, dependency rationale,
  and remaining gates are in `docs/SLICE_5_IMPLEMENTATION.md`.
- RSVP now distinguishes unknown metadata from zero, preserves same-scope
  refresh data, serializes writes and reconciles uncertain acknowledgments.
  Exact visible-RSVP counts and an authorized preview of at most four attendees
  retain existing RLS/block boundaries. Web/native deletion is actionable.
- Events share UTC/local-time helpers, explicit timezone display, native/web
  inputs, optional ends, strict rollover/DST checks, and start/end classifications.
  Home’s existing future-only teaser logic is preserved.
- Directory search and combined filters run before deterministic 50-row pages,
  with debouncing, correct query quoting, scope/reset/stale-result protection,
  and usable retries. Repeated mounted-tab mentor/Jobs shortcuts remain intact.
- Jobs expose closed/missing/invalid link states, safe opening with inline errors,
  scoped detail refresh, and minimized poster fields. Share to chat revalidates
  existing resource/channel permissions and prepares text for explicit review,
  append/cancel, and Send through Slice 3’s unchanged composer/recovery transport.
- Added only `@react-native-community/datetimepicker` 9.1.0, matching the installed
  Expo 56 compatibility manifest and official docs; no unrelated package upgrades.
- Local checks: typecheck passed; 33 suites / 538 tests passed; lint 0 errors /
  24 warnings; diff checks passed. Prior tests retained. All SQL/migration files
  match the session-start inventory; V9–V11 remain unapplied.
- Generated 52 isolated synthetic component fixtures at 360/820-point widths.
  Browser URL security policy blocked local-file inspection; no screenshots or
  rendered visual acceptance. Native picker, enlarged text, icons, keyboard,
  accessibility, real navigation, SQL/RLS, and concurrency checks remain pending.
- No production/credentials, remote database actions, migration execution, EAS,
  builds/uploads/deployment, commits/pushes/merges, external messages, or Slice 6
  distribution. Next: independent Slice 5 review and the bounded QA gates above.

### 2026-09-17 — Independent Slice 5 review

- Two P2 corrections required before local acceptance: share review can remain
  busy/disabled after blur during access validation; native date input resets
  partial selections to now and cannot clear an optional end.
- Three temporary actual-component diagnostics reproduce the failures, using
  controlled focus/picker/backend boundaries. Existing tests mock focus as a
  no-op or replace date-input controls and do not exercise these paths.
- Independently rerun: 33 suites / 538 tests passed, typecheck and diff checks
  passed, lint 0 errors / 24 warnings. Checked 45 protected SQL/core files against
  the Slice 5 inventory: unchanged. No installed-device or visual QA claimed.
- Evidence: `docs/SLICE_5_REVIEW.md`. Next: run
  `docs/SESSION_5_FOLLOWUP_PROMPT.md` in the Slice 5 implementation chat, then
  return the correction summary here. Hold Slice 6 while these are resolved.
- Only review/handoff documentation changed. V9–V11 remain unapplied; SQL,
  concurrency, rendered visual, native picker, and prior release gates stay open.
  No application/migration edits, remote actions, builds, commits, or pushes.


### 2026-09-17 — Slice 5 bounded correction completion

- Corrected share-review focus recovery: blur/unmount releases only its owned
  access validation; refocus offers an explicit usable Add/Append even before
  the obsolete request settles. Ownership guards prevent old callbacks/finally
  from affecting a newer check. No auto-append/send; drafts/attempts remain intact.
- Corrected native date input: date/time partial selections persist independently,
  picker defaults stay uncommitted, and optional End owns an accessible Clear
  action that closes the picker and clears date/time/DST occurrence. Both real
  forms submit null ends while preserving Start and other edits; web retains
  equivalent clear behavior. Existing timezone/DST/required-field guards remain.
- Four permanent reproductions failed before fixes. Added 26 actual-component
  regressions with working focus cleanup/refocus and only the native picker UI
  boundary mocked. Focused: 5 suites / 135 tests passed. Full: 34 suites / 564
  tests passed. Typecheck/diff checks passed; lint 0 errors / 24 warnings.
- Scope: six application files (share review/helper, native/web date input,
  create/edit event forms), one new regression file, and three handoff docs.
  Compared 205 existing out-of-scope files: unchanged. No prior tests, packages,
  SQL/migrations, or accepted Slice 1–4 behavior changed. V9–V11 remain unapplied.
- `docs/SLICE_5_REVIEW.md` retains original findings and appends correction
  evidence; `docs/SLICE_5_IMPLEMENTATION.md` records the new verification results.
  Ready for independent correction review, **not independently accepted**.
- Hold Slice 6. Rendered/native/browser, SQL, concurrency, and previous release
  gates remain open; the browser security-policy block was not retried/bypassed.
  No production/credentials, remote database, EAS/env, build/upload/deployment,
  commit/push/merge, dependency change, or external messages occurred.

### 2026-09-17 — Independent Slice 5 correction acceptance

- Both bounded corrections accepted locally; no new blocking source finding.
  Evidence and clarification of the original clear-control diagnosis are in
  `docs/SLICE_5_REVIEW.md`.
- Independently rerun: 34 suites / 564 tests, typecheck, and diff checks passed;
  lint 0 errors / 24 warnings. All 205 existing files outside the declared
  correction scope match the saved baseline.
- Saved `docs/SESSION_6_PROMPT.md` for distribution preparation and release
  verification in a fresh session. The Slice 5 code-review hold is lifted.
  No further feature slice is recommended before resolving release gates.
- V9–V11 remain unapplied; SQL/concurrency, rendered UI, installed native picker,
  and exact-build browser/device QA remain open. No actual release approval.
- Only review/planning documentation changed; no application/migration edits,
  remote actions, credentials, builds, commits, or pushes.

### 2026-09-17 — Slice 6 preparation and verification readiness

- Executed the saved Session 6 scope in the current repository chat after the
  app denied automated access to its own chat UI; a fresh chat was not opened
  and the block was not bypassed. No launch/distribution authorization.
- Added [SLICE_6_READINESS.md](SLICE_6_READINESS.md) with a go/no-go matrix,
  concrete prerequisite evidence, separate prior/current/unexecuted results,
  migration/client compatibility sequence, runtime coverage and owner actions.
  Verdict: **NO-GO**; verification remains incomplete.
- Added [STEWARD_DISTRIBUTION_RUNBOOK.md](STEWARD_DISTRIBUTION_RUNBOOK.md) for
  Sigma Phi Epsilon, UCSB and Pi Beta Phi, UCSB: named-role placeholders,
  separate TestFlight/chapter links, original-invite/paste-code recovery,
  email confirmation, pending review/alumni designation, unsent copy, support,
  real event/welcome thread/responsive mentors, and a manual chapter/cohort funnel.
- Reconciled STATUS, LAUNCH_RUNBOOK, APP_STORE_CHECKLIST,
  RELEASE_OPERATOR_CHECKLIST and README. Preserved historical records; corrected
  stale migration limits/rerun advice, EAS initialization, tab/link descriptions,
  coordinate seeding and profile-deletion removal guidance. Owner-reported
  build 11/live V6–V8 remain unverified history. V9–V11 remain unapplied.
- Prerequisite inspection: Node/npm/Supabase CLI/xcrun available; psql,
  postgres/initdb/pg_ctl, Docker and Podman absent from PATH. Companion schema
  directories and local Supabase config absent; no authoritative base DDL or
  confirmed disposable backend. Simulator/simctl are available, but isolated
  candidate binary/backend compatibility is unconfirmed. No SQL was executed.
- Existing static fixtures were inventoried and scripts inspected; the earlier
  browser URL security block remains unresolved and was not retried/bypassed.
  No rendered inspection, screenshots, installed picker, browser/device
  journeys or new visual acceptance. All four SQL suites/concurrency stay open.
- Checks executed: documentation diff/whitespace/fence/local-link validation
  passed; **217 protected existing files unchanged** against the pre-edit hash
  inventory. Full Jest/typecheck/lint were not repeated for documentation-only
  changes; prior independent evidence remains 34 suites / 564 tests, typecheck/
  diff passing, lint 0 errors / 24 warnings. No new acceptance-test failures
  were observed because SQL/runtime acceptance was not executable.
- No application, migrations, dependencies or regression tests changed; no
  production/remote database, credentials, EAS/env, global installs/services,
  builds/uploads/deployments, commits/pushes/merges, live data or external messages.
- Next bounded action: owner supplies an authoritative schema-only artifact
  with provenance and a confirmed disposable local synthetic database; execute
  the documented V9 → V10 → V11, four-suite and concurrent SQL sequence and
  return actual results for independent review. All release gates remain in force.

### 2026-09-17 — Independent Slice 6 preparation review

- Accepted readiness documentation and steward distribution preparation. This
  is not completion of Slice 6 verification or release approval; NO-GO remains.
- Independently confirmed all 217 protected files match the Session 6 baseline;
  diff, fences, whitespace and local links passed across the eight preparation
  documents. No app-test rerun or new SQL/runtime/remote evidence.
- Clarified schema intake in readiness and operator runbooks: record provenance,
  date, included migration versions and omissions. Restore an authoritative
  snapshot according to its actual contents; do not blindly replay V1–V8 if
  already included. Schema-only means no member/message rows or credentials.
- Next: obtain that artifact and establish a confirmed disposable local backend,
  then execute the four SQL suites and concurrency checks. Native-picker and
  browser/device gates remain independently open. Only documentation changed.
