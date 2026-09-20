# Slice 5 follow-up — focus recovery and native date input

Paste into the Slice 5 implementation chat attached to this workspace.

```text
Fix the two independent Slice 5 review findings in:
/Users/pkarakala/Desktop/greekties

Read docs/SLICE_5_REVIEW.md, docs/SLICE_5_IMPLEMENTATION.md, and the pilot plan.
Inspect applicable AGENTS.md and git status. Preserve all uncommitted Slice 1–5
work, including all migrations and existing acceptance coverage. Implement only
these corrections; do not start Slice 6.

1. ChatShareReview remains loading/disabled after blur during pending access
   validation. Focus cleanup invalidates the run, its finally cannot reset busy,
   and refocus never restores a usable Add/Append control. Make that lifecycle
   explicit: retain a retryable review or clearly cancel it on return. Never
   auto-append/send. Obsolete reads must not insert into the draft or affect a
   newer run. Preserve existing drafts, attempts, and account/channel guards.
   Test actual focus cleanup/refocus before and after delayed validation settles,
   including errors, cancellation, unmount, and a newer operation. A no-op
   useFocusEffect mock is insufficient for this regression.

2. Native EventDateInput falls back to now whenever either date or time is empty,
   so a chosen date and the controlled picker can disagree. Derive picker values
   from independently preserved fields without silently committing defaults for
   missing fields. Cover date-first/time-first input and reopen/dismissal.
   Native End (optional) also has no clear action. Add an accessible way to remove
   the whole optional end (date, time, DST occurrence), keeping Start and other
   edits unchanged. Verify both create and edit save ends_at:null afterward.
   Required Start validation, timezone guards, DST gaps/repeated occurrences,
   and unchanged stored-instant preservation must continue working.
   Test the actual date-input component with only the native picker boundary
   mocked, plus real form integration. Do not replace it with editable text
   fields and claim that proves native behavior. Keep web behavior intact.

Add permanent reproductions, demonstrate the corrected behavior, and run focused
tests, full suite (baseline 538 tests), typecheck, lint, and diff checks. Report
component tests separately from actual native/browser QA; those gates remain
pending if supported inspection is unavailable. Do not bypass the previously
reported browser URL security-policy block.

Update docs/SLICE_5_REVIEW.md with correction evidence, preserving the original
findings, plus docs/SLICE_5_IMPLEMENTATION.md and the pilot progress log. Scope
changes to the share review/date input/form integration as needed, tests, and
these docs. No new dependencies, migrations, unrelated redesign or refactoring.

No production access, remote database actions, live credentials, EAS/env changes,
builds/uploads, deployment, commits, pushes, merges, or external messages.
V1–V11 and SQL acceptance files remain unchanged; V9–V11 remain unapplied.
Complete the local corrections and return a concise summary for independent
review. Do not mark them independently accepted yourself.
```
