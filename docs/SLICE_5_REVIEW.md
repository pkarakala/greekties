# Slice 5 independent review — 2026-09-17

Current verdict: **Slice 5 accepted locally after independent correction review**.
Both correction paths pass source review and permanent component regressions.
SQL and real browser/device release gates remain open. The original findings
below are historical; see the acceptance entry at the end.

## P2: share review stays busy after blur during validation

In `components/ChatShareReview.tsx:31`, focus cleanup invalidates the append run
and sets `live` false, but never resets local `busy`. The pending append's
`finally` at line 52 deliberately skips obsolete runs. Refocusing sets `live`
true without clearing busy. The store returns the attempt to `ready`, while
the Add/Append button remains loading and disabled.

Reproduction using the actual ChatShareReview and MessageComposer:

1. Prepare an event share and delay its source-access read.
2. Press Add to draft, then invoke the focus cleanup (navigate away while the
   screen remains mounted).
3. Resolve the delayed read and return focus to the same screen.
4. The draft is correctly unchanged and the share is ready, but Add to draft is
   still disabled. Cancel is available; an ordinary return cannot resume it.

Required correction: make cancellation of a validation run settle its UI state.
On return, either offer a usable explicit retry of the retained share or clearly
cancel/remove that review. Do not auto-append/send, permit obsolete validation
to insert text, or let an older completion reset a newer run's state. Cover
blur/refocus before and after settlement, errors, cancellation, and unmount.

The existing share suite mocks `useFocusEffect` as a no-op, so it cannot detect
this transition. Add a regression that actually runs its focus and cleanup
callbacks with the real review component.

## P2: native date input does not support partial or cleared optional end values

`components/EventDateInput.tsx:30` derives the picker's value exclusively from
complete valid date+time candidates, falling back to `new Date()`. Selecting a
future date while time is empty updates the displayed date label, but the
picker's controlled value immediately returns to today. Reopening the date
picker therefore shows a different date than the field. Time-first entry has
the equivalent missing-component risk.

The native component also exposes no way to clear its optional end fields.
Picker dismissal preserves the current value; its date/time callbacks only
write nonempty selections. New/edit validation tells members to clear both end
fields, but a native member cannot remove an existing end or undo a partially
entered end without leaving the form. This is distinct from the web HTML inputs,
which can be cleared.

Required correction:

- Preserve selected date and time components independently when constructing
  picker values, including partially entered Start and End fields. A temporary
  default for the missing component must not silently populate that form field.
- Add an accessible native action to remove an optional end. Clear end date,
  end time, and selected DST occurrence together without changing Start or
  unrelated fields. Create/edit must save `ends_at: null` afterward. Required
  Start fields must not inadvertently become optional.
- Preserve timezone-change checks, DST gap/ambiguity validation, and exact
  unchanged-edit instants. Handle Done/dismissal without surprising mutations.
- Test the actual EventDateInput component with only the platform picker module
  mocked, then test create/edit integration for removing an end. Current form
  tests replace EventDateInput with text fields, which conceal these native gaps.

Diagnostic evidence: choosing 2099-01-05 with empty time leaves the label at
2099-01-05 but passes the current date to the picker on reopen. A separately
populated optional End exposes no clear/remove control.

## Independent verification and scope

- Existing full suite: **33 suites / 538 tests passed**.
- Typecheck and `git diff --check` passed.
- Lint independently rerun: **0 errors / 24 warnings**.
- Three extra diagnostics fail as described above, stored temporarily in
  `/private/tmp/greekties-slice5-review-z5hadgdh/` (`share.test.tsx`,
  `picker.test.tsx`). They use real components with controlled focus/picker and
  backend dependencies. They are not installed-device or real-browser evidence.
  Add permanent regressions; this temporary path is not a durable test suite.
- Compared 45 protected SQL/migration and accepted core behavior files against
  `/tmp/greekties-slice5-baseline.json`: no differences.
- Reviewed source for explicit unknown attendance, exact visible counts,
  read/write reconciliation, query-scoped directory pagination, literal search
  escaping, safe job URLs, reviewed sharing, and strict internal paths. No other
  blocking finding was established in this pass. Actual PostgREST/RLS search,
  joins/counts and channel-visibility behavior still need disposable SQL/runtime QA.
- V9–V11 remain unchanged/unapplied. All four SQL suites, concurrency tests,
  rendered visual inspection, native picker behavior, and exact-build QA remain
  open. The prior browser URL security-policy block was not retried or bypassed.

Only review/handoff docs changed here. No application/migration edits, remote
data access, credentials, deployment, builds, commits, or pushes. Return
`docs/SESSION_5_FOLLOWUP_PROMPT.md` to the Slice 5 implementation chat and bring
the correction summary back for independent review.

## 2026-09-17 — Bounded corrections implemented locally

Status: ready for independent correction review, **not independently accepted**.
The original findings and verdict above are preserved. Slice 6 remains on hold.

### Share validation after focus loss

- Blur/unmount now releases the specific validation owned by that review and
  returns its share to `ready`. Refocus resets the local loading control; the
  member can explicitly Add/Append again even before the old request settles.
  Nothing is appended or sent on focus.
- A small ownership map in `lib/chat-share.ts` distinguishes validation runs of
  the same share. Old success/error/finally callbacks cannot insert text, change
  a newer run's state, or reset its loading indicator. Cleanup releases only
  its own run. Existing account/conversation access checks, current-draft append,
  pending/failed attempt preservation, consumption, and explicit cancellation
  remain in place. Message send/retry/discard transport is unchanged.
- Permanent tests run focus and cleanup callbacks through a controlled focus
  subscription, with the real review, composer, share helper, and recovery
  store. They cover settlement before/after refocus, success/error/throw,
  retry while the old read is pending, another share, cancellation, unmount and
  remount, account/membership loss, and preservation of a failed send plus draft.

### Native partial selections and optional end removal

- The actual native date input derives a temporary picker value from the
  independently selected date and time. The missing component is only a picker
  seed: opening, Done, and dismissal do not populate missing form fields.
  Date-first/time-first selections survive reopening on mocked iOS and Android.
- Optional inputs now expose Clear end time themselves. The existing form-level
  action was moved into this control, so it also closes the picker and invalidates
  its callbacks. Clear removes date, time, and the selected DST occurrence
  together; a delayed picker callback cannot restore them. Only End is optional.
  Web retains its HTML input behavior and equivalent clear action.
- The picker preserves an unchanged saved instant, including seconds and a
  repeated-hour occurrence. Gap/ambiguity validation, strict date parsing,
  required Start, optional-end ordering, and timezone-change guards remain.
- New regressions use the real `EventDateInput` and real create/edit forms, with
  only the native picker UI boundary mocked (plus backend/auth/router services).
  Both forms submit a null end after clearing, preserving Start and unrelated
  edits. Tests no longer substitute text fields for the native control to claim
  coverage of these findings.

### Evidence and exact correction scope

- Four permanent reproductions failed before the correction: iOS/Android
  date-first reopening, share refocus after delayed validation, and missing
  optional clear in the native component. Local log:
  `/tmp/slice5-correction-before.log`. All now pass.
- Added `__tests__/components/slice5-corrections.test.tsx`: **26 tests passed**.
  Focused correction/share/date/time/composer regressions: **5 suites / 135 tests**.
- Full `npm test -- --runInBand`: **34 suites / 564 tests passed**, retaining all
  538 previous tests. Typecheck and `git diff --check` passed. Lint: **0 errors /
  24 warnings**, unchanged. No rules were suppressed or downgraded.
- Application changes are limited to `components/ChatShareReview.tsx`,
  `lib/chat-share.ts`, `components/EventDateInput.tsx`,
  `components/EventDateInput.web.tsx`, `app/events/new.tsx`, and
  `app/events/edit/[id].tsx`. Documentation updates: this review,
  `docs/SLICE_5_IMPLEMENTATION.md`, and `docs/PILOT_IMPLEMENTATION_PLAN.md`.
- Compared **205 existing files outside the correction scope** with
  `/tmp/greekties-slice5-correction-baseline.json`: unchanged. All prior regression
  files, package/lockfile contents, and migration/SQL files are preserved; no
  dependency or schema change was made.

These results establish controlled component and source behavior, not installed
native-picker or browser navigation behavior. The prior browser URL security
block was not retried or bypassed. Rendered visual/native/device verification,
all four SQL suites, concurrency, and previous release gates remain open.
V9–V11 remain unchanged and unapplied. No remote database/production actions,
credentials, EAS/env changes, builds/uploads/deployment, commits/pushes/merges,
or external messages occurred. Next: independent review of these two corrections;
do not start Slice 6 from this implementation result.

## Independent correction acceptance — 2026-09-17

Slice 5 is accepted locally. No new blocking finding in this bounded review.

- Share validation has explicit per-run ownership. Blur/unmount releases only
  that run; refocus restores an explicit Add/Append action. An obsolete read or
  finally block cannot append text or reset a newer validation. Account and
  membership recovery invalidation still prevent access to old drafts.
- Native picker values retain independently selected date/time components.
  Optional-end clearing invalidates picker callbacks and clears both fields
  and the DST choice. Actual create/edit component tests verify null ends and
  preserved Start/unrelated fields. Platform picker UI remains mocked.
- Clarification of the original finding: the component diagnostic established
  absence of a component-level clear action, not absence of every form-level
  action. The correction consolidates the existing form-level clear control
  into the shared input and adds stale-callback protection. The partial-value
  reset was independently reproduced and is resolved.
- Independently rerun: **34 suites / 564 tests passed**, typecheck passed,
  `git diff --check` passed; lint **0 errors / 24 warnings**.
- Compared the correction baseline's 214 existing files: 205 unchanged; the
  nine changed files are the six declared application files and three handoff
  documents. The new permanent regression suite was inspected. Dependencies,
  migrations, and prior test files in that inventory are unchanged.

Next recommended session: `docs/SESSION_6_PROMPT.md` for distribution preparation
and release verification. The code-review hold is lifted; actual distribution
is not approved. V9–V11 remain unapplied. SQL/RLS, concurrent database sessions,
rendered visual QA, installed native picker, and exact-build device/browser
journeys remain unverified. This review changed documentation only; no app or
migration edits, remote access, builds, commits, or pushes.
