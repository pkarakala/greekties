# Slice 3 independent review — 2026-09-17

Original verdict: one bounded correction required before local acceptance.
Correction review status: **accepted locally** after independent verification
below. Database and real browser/device validation remain pending; this review
does not authorize migration execution or release.

## P2: web users cannot discard a failed or uncertain message

`components/MessageComposer.tsx:56` opens the discard confirmation exclusively
with React Native `Alert.alert`. In the installed `react-native-web` package,
`dist/exports/Alert/index.js` and its CommonJS counterpart implement that method
as `static alert() {}`. There is no browser dialog and its buttons never run.

The composer disables Send whenever an attempt exists (line 22). Consequently,
a web user with an unrecoverable failed/uncertain attempt cannot abandon it and
send their newer draft. Navigation preserves the attempt, so it does not resolve
the blockage. Reloading the page discards in-memory recovery and newer drafts;
that is not an acceptable substitute for the advertised Discard action. A
deleted message whose V11 reservation prevents reinsertion is one concrete case
where Retry may never resolve the attempt.

Reproduction in both actual conversation screens:

1. Submit text and return a denied INSERT while parent/history reads still work.
2. Type a separate newer draft after submission.
3. Press Discard saved message using the installed web Alert implementation.
4. Observe no actionable confirmation; the attempt remains and Send is disabled.

Two temporary diagnostic component tests reproduce this missing confirmation in
`/private/tmp/greekties-slice3-review-h17pd8p8/review.test.tsx`. They reuse the
existing local screen/query mocks, substitute the actual installed web Alert
method, and fail at the confirmation assertion for both channel and mentorship.
This is a component diagnostic, not an executed real-browser journey. The
temporary directory is session evidence, not a permanent regression suite.

Required correction:

- Provide an actionable, accessible web confirmation, preferably a small inline
  confirmation usable across platforms, or an explicit platform-aware solution.
- Retain the warning that discarding recovery does not delete a possibly sent
  message. Cancel must preserve the attempt and newer draft.
- Confirm must discard only the attempt for which confirmation was opened,
  preserve newer typing, and allow a new send. Keep the existing expected-ID and
  current-entry protections if the old attempt settles, a new attempt replaces
  it, or account/conversation access changes while confirmation is open.
- Add permanent actual-composer regressions for both conversation types and web
  behavior. Tests must exercise the usable confirmation, not merely verify an
  `Alert.alert` call or manually invoke an unavailable web callback.
- Keep the correction scoped to this new recovery control. Broader pre-existing
  Alert-based moderation/reporting behavior is outside this finding.

## What is working in the reviewed source

- Separate draft and attempt state prevents older completion from overwriting
  newer typing. The synchronous pending guard covers rapid taps.
- Stable UUIDs survive retry; reconciliation checks the exact ID, conversation,
  sender, and content using authenticated reads. A conflict alone is not success.
- Account/chapter/member transitions invalidate private recovery and callbacks;
  ordinary navigation and same-account revalidation retain in-memory recovery.
- Send timeout and stale-run checks prevent a timed-out operation from adopting
  results or issuing later reconciliation work after invalidation.
- History/realtime responses merge by ID with deletion suppression, while send
  errors remain separate from history errors.
- V11's draft ledger addresses resurrection after physical deletion without
  exposing its records to clients or broadening message update permissions.
  Actual transaction, uniqueness, privilege, and RLS behavior remains unverified.

## Checks and remaining gates

- Independently rerun: **28 suites / 381 tests passed**, typecheck passed, and
  `git diff --check` passed. The two additional diagnostic tests fail as above.
- Lint was not rerun; implementation reports 0 errors / 24 warnings.
- V9, V10, and V11 remain unapplied. All four SQL suites, real concurrent-session
  checks, and native/browser QA remain open. Verify the actual base mentorship
  schema, V11 backfill, write locks, deleted-ID rejection, rollback on denied
  INSERT, and older-client default UUID behavior in a disposable database.
- Recovery is process/page memory only. Browser reload, app termination, and
  separate tabs are outside its documented retention boundary.
- Only review/handoff docs changed in this review. No application, migration,
  SQL-test, credential, EAS, production, deployment, commit, or push changes.

Next action: use `docs/SESSION_3_FOLLOWUP_PROMPT.md` in the Slice 3 implementation
chat, then return its correction summary for independent review.

## 2026-09-17 — Web discard correction implemented locally

Correction status: ready for independent review, not independently accepted.
The original finding and review verdict above are preserved. Slice 4 stays on hold.

- Replaced only the shared composer's Alert-based discard with inline confirmation
  controls in `components/MessageComposer.tsx`. Both chapter and mentorship use
  the same rendered Cancel/Discard buttons on web and native. The warning states
  that this removes local recovery only, does not delete a possibly sent message,
  and does not cancel a send already in progress. Controls retain accessible
  labels, readable warning text, 44-point targets, and wrapping action rows.
- Cancel preserves the attempt and newer draft. Confirm uses the existing
  expected-ID/current-entry store guard and preserves newer typing, enabling a
  new send when otherwise allowed. The confirmation also checks the immutable
  attempt snapshot and component lifetime. Retry changes that snapshot even for
  the same UUID; settlement/replacement, account/membership transitions, route
  changes, cancellation, and unmount invalidate old confirmation handlers.
- The recovery store, retry transport/authorization, screens, SQL, and all other
  Alert call sites are unchanged. No other slice was started.

Permanent regression evidence in `__tests__/components/message-composers.test.tsx`:

- The new direct-control tests failed against the original component at the
  missing inline confirmation. The web cases use the installed no-op web Alert
  implementation, reproducing the review's failure without a fabricated dialog.
- **54 additional tests** cover both actual conversation screens under web, iOS,
  and Android configurations: failed/uncertain attempts; clicking Cancel and
  Confirm; typing while confirmation is open; sending the preserved draft with
  a new identity; late settlement followed by attempt B; same-ID retry while
  pending and after failure; conversation return, unmount/remount, logout,
  account switch, and membership loss. Additional stale-handler invocations
  test invalidation; actionable web support is established by pressing the
  rendered confirmation controls, not by manually calling an Alert callback.
- The actual-screen suite passes **63 tests** (9 existing + 54 new). Focused
  Slice 3 regressions pass **5 suites / 152 tests**. Full suite passes
  **28 suites / 435 tests**, retaining all prior Slice 1–3 regressions.
- `npm run typecheck`, `git diff --check`, and follow-up baseline whitespace
  checks passed. Lint passes with **0 errors / 24 warnings**. The existing
  non-fatal Expo Go push warning remains in the full events suite.

These are React Native component tests with controlled platform settings and
mocked backend/router/native services, not real browser or installed-device
journeys. Keyboard focus, screen-reader announcements, enlarged text, and native
layout still need manual verification. All four SQL suites and concurrent-session
checks remain pending; V9–V11 are unchanged and unapplied.

Only the shared composer, its existing regression test file, this review, and
the pilot plan changed in the correction. No credentials, remote database actions,
migrations, builds, deployments, commits, pushes, merges, or external messages.
Next: independently review this correction before accepting Slice 3 or beginning
Slice 4. Existing release gates remain open.

## 2026-09-17 — Independent correction acceptance

The web discard finding is resolved in the reviewed source. The shared composer
renders actionable inline Cancel/Discard controls rather than relying on a web
Alert. Cancel preserves recovery and newer typing; confirm invokes the existing
expected-ID store operation only while the original entry, immutable attempt
snapshot, confirmation, and component lifetime remain current. Pending retries,
replacement attempts, settlement, and invalidated account/conversation state
cannot be discarded by stale handlers. The correction stays within the composer
and its regressions; retry transport and authorization behavior are unchanged.

Independently rerun: **28 suites / 435 tests passed**, typecheck passed, and
`git diff --check` passed. Reviewed the permanent tests that press rendered
confirmation controls in both conversation screens under web/iOS/Android test
configurations, including newer typing and stale-confirmation transitions.
Lint was not rerun here; implementation reports 0 errors / 24 warnings.

Slice 3 is accepted locally. This is component/source evidence, not real browser,
native-device, or SQL verification. V9–V11 remain unapplied; all four SQL suites,
concurrency tests, and prior native/browser release gates remain open. Recovery
still lasts only for the current app process/browser page.

Only documentation changed in this independent review. Next recommended session:
local validation readiness and execution using `docs/SESSION_3_QA_PROMPT.md`,
before moving into Slice 4 visual work. The discard correction no longer blocks
progress; missing test infrastructure/base schema must be reported explicitly,
not bypassed by treating mocked tests as database acceptance.
