# Slice 1 review — 2026-09-16

Original review verdict: implementation follows the accepted direction, but needs
two client corrections before local acceptance. This review does not authorize
deployment.

Correction status (2026-09-16): both findings independently reviewed and resolved
for local acceptance. SQL and real-device/browser release gates remain open.
The findings below preserve the original review evidence.

## 1. High priority: membership refresh destroys unsaved screen state

Evidence: `lib/auth.tsx:63` clears the profile and sets loading on every profile
read. Its AppState-active and browser-focus handlers call that same path
(`lib/auth.tsx:180`). `acceptSession` also invalidates the profile for every auth
event, including same-account events. `app/_layout.tsx:25` replaces protected
children with MembershipScreen when loading, so React unmounts those children.

Result: an already-approved member typing a chat message or completing a form
can lose their unsaved work after switching apps and returning. A profile-photo
picker is another important native lifecycle case to test. The root tab subtree
can also be reset, not just the visible field.

Reproduction verified in a temporary component test:

1. Render a stateful TextInput inside ScreenAccess for an approved member.
2. Type "Unsaved introduction".
3. Simulate the actual refresh transition: profile=null, profileState=loading.
4. Restore the same approved profile and profileState=ready.
5. Expected the draft to remain; actual value was an empty string.

Fix requirements:

- Distinguish initial identity/member resolution and account changes from
  revalidation of the same previously-approved account.
- Preserve local drafts through routine foreground, browser-focus, and token
  refresh revalidation. If content is hidden during validation, do not discard
  unsaved state; do not simply weaken authorization to preserve it.
- Keep initial loading fail-closed. Confirmed removal, logout, and account
  switching must hide/discard the prior account's private content appropriately.
- Test refresh failure/retry and eventual rejection, plus same-account auth events.
- Avoid clearing block state on same-account events without an appropriate
  reload: `acceptSession` currently clears it, while its fetch effect depends on
  user ID. This is an adjacent lifecycle concern to cover during the correction,
  not a claim that V8 server block enforcement is bypassed.

## 2. Medium priority: cancellation can leave an invitation saved

Evidence: `app/join/[code].tsx:63` starts an asynchronous save; saved React state
is populated only when it completes. `leave()` at line 77 invalidates the attempt
and clears only when saved is already populated. If Cancel is pressed while the
save is pending, it navigates away without cleanup. The save still completes;
its callback returns early because the attempt was invalidated.

Result: the user explicitly cancels, but the stored invitation can be offered
again after login/restart. It does not meet the cancellation contract.

Reproduction verified in a temporary component test:

1. Delay storePendingInviteCode with a controlled promise.
2. Open JoinScreen and press Cancel invitation before that promise resolves.
3. Resolve the save with the invitation revision.
4. Expected revision-specific cleanup; clearPendingInvite was never called.

Fix requirements:

- Coordinate cancellation with pending persistence. Either await the save and
  conditionally clear its revision, or use another design that guarantees the
  canceled record cannot be left behind.
- Retain revision checks: cancellation for invite A must never clear a newer
  invite B (or a replacement A with a different revision).
- Cover cancellation before save completion, unmount, storage failure, and
  replacement while cancellation is pending using durable test expectations.

## Verification and remaining gates

- Independently rerun: typecheck passes; 19 suites / 211 existing tests pass;
  git diff whitespace check passes.
- Two extra diagnostic tests fail as described above. They were run in
  `/private/tmp/greekties-slice1-review-_4s8ztgz/` against the actual ScreenAccess
  and JoinScreen with the existing suite's mocks. This temporary path is evidence
  for this session only; add permanent regression tests in the repository.
- Lint result comes from the implementation session, not a new review run.
- The V9 draft closes the rejected-invite reapproval path in source and supplies
  an admin-only, same-chapter reinstatement RPC that clears admin privileges.
  Its SQL has not been executed by this review; this is not database approval.
- V6/V7/V8 remain unchanged in the working diff. V9 remains unapplied. Run both
  SQL suites in a confirmed disposable environment and perform real browser/
  native QA before any separately authorized release.

No application or migration edits were made in this review. Return the two
findings to the Slice 1 implementation chat using the saved follow-up prompt.


## 2026-09-16 — Correction implementation and verification

Both diagnostic failures now have permanent regression tests in the repository.
Before applying corrections, the tests reproduced the two failures: the draft
returned empty after a same-account refresh, and cancellation never called
revision-specific cleanup when save completion was delayed.

### Finding 1 corrected: preserve state while revalidating membership

- `lib/auth.tsx` retains the last profile for the same identity during a profile
  read, and preserves block state across same-account auth events. It still
  marks membership loading/error during validation; it does not report the
  cached approval as a new successful membership check. Account changes and
  sign-out immediately clear the prior profile and blocks. Existing generation
  checks continue to ignore obsolete profile responses.
- `app/_layout.tsx` retains a stable, identity-keyed protected subtree for a
  previously approved account during revalidation. That subtree uses
  `display: none`, disables pointer events, and hides descendants from
  accessibility while membership recovery is shown. Initial unresolved users
  never mount private content. A failed revalidation stays on the current route
  behind recovery instead of replacing the route and losing the draft.
- `lib/entry.ts` supplies the exact-account approved-profile check. Confirmed
  removal, missing membership, logout, and account switching discard the old
  subtree. Reinstatement or later login does not resurrect its discarded draft.
- Permanent tests use the actual AuthProvider and ScreenAccess with mocked
  services. They type into a stateful TextInput, invoke AppState background →
  active (the photo-picker/app-switch lifecycle), browser focus, and same-account
  TOKEN_REFRESHED/SIGNED_IN/USER_UPDATED events, then verify both hidden state
  preservation and visible recovery. They also cover error/retry, eventual
  rejection or missing membership, block continuity, stale reads after logout
  or switching accounts, and prevention of redirect-driven draft loss.

### Finding 2 corrected: finish cancellation after pending persistence

- `app/join/[code].tsx` keeps the persistence promise independently of rendered
  `saved` state. Cancel waits for that promise and clears precisely its revision.
  Cleanup runs even if the screen unmounts, while obsolete/unmounted callbacks
  cannot update the screen or navigate. Duplicate cancellation/join actions are
  disabled while cancellation is pending.
- Permanent component tests combine the real pending-invite store with controlled
  storage promises. Fresh store instances verify that canceled records are absent
  after a simulated restart, including cancellation followed by unmount and failed
  storage writes. They verify B and A→B→A replacement revisions survive an older
  cancellation, and ordinary unmount without cancellation still preserves context.
- Physical storage deletion can still fail. The existing explicit failure warning
  remains; the UI does not silently navigate as if durable cancellation succeeded.
  A test verifies this distinction, including that the unavailable store may still
  contain the old record on restart. Mock persistence checks do not establish
  real device/browser storage behavior.

### Changed files and checks

Correction code: `lib/auth.tsx`, `lib/entry.ts`, `app/_layout.tsx`, and
`app/join/[code].tsx`. Permanent regressions: `__tests__/lib/auth.test.tsx` and
`__tests__/components/chapter-entry.test.tsx`. Documentation: this review and
`docs/PILOT_IMPLEMENTATION_PLAN.md`. Other existing changes and handoff documents
were preserved. No migration or SQL-suite changes were made in this correction.

- `npm run typecheck`: passed.
- Focused auth/entry/persistence tests: **4 suites / 74 tests passed**.
- Full `npm test -- --runInBand`: **19 suites / 232 tests passed** (21 added tests).
  The existing non-fatal Expo Go push warning remains in the events suite.
- `npm run lint`: **0 errors / 26 warnings**, unchanged from Slice 1 implementation.
- Follow-up source diff reviewed against the pre-correction files;
  `git diff --check` passed. V6/V7/V8 remain unchanged.

V9 remains **unapplied and unchanged**. Both SQL acceptance suites remain
unexecuted; disposable-database policy verification and real native/browser QA
remain release gates. In particular, verify keyboard/focus behavior, actual
photo-picker return, nested tab/navigation state, VoiceOver and browser focus,
removal during a failed refresh, and cancellation during real storage delays.
No production access, remote migration, deployment, build, EAS/credential/env
change, commit, or push occurred. Slice 2 was not started. Next action: review
this correction handoff; do not infer release approval from these local checks.

## 2026-09-16 — Independent correction review

Both prior findings are resolved in the reviewed source and permanent tests.
Same-account refresh retains an identity-keyed subtree hidden from display,
pointer interaction, and accessibility; removal and account changes discard it.
Cancellation now awaits its persistence promise and clears only that revision,
including after unmount. Regression coverage includes actual AuthProvider with
mock services and cancellation using the real store with controlled persistence.

Independently rerun: typecheck passed, 19 suites / 232 tests passed, and
`git diff --check` passed. No application or migration changes made. Lint was
not rerun here; the implementation result remains 0 errors / 26 warnings.

Local Slice 1 acceptance is appropriate. This does not establish live SQL
behavior, real browser routing, or native screen/keyboard/accessibility behavior.
V9 is still unapplied; all previously documented release gates remain open.
Proceed to Slice 2 local implementation using `docs/SESSION_2_PROMPT.md`.
