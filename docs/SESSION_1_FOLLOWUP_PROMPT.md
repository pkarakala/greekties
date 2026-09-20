# Slice 1 correction prompt

Paste into the existing Slice 1 implementation chat. A fresh chat can also use
it when attached to this same workspace.

```text
Continue Slice 1 in /Users/pkarakala/Desktop/greekties.
Read docs/SLICE_1_REVIEW.md and the latest progress entry in
docs/PILOT_IMPLEMENTATION_PLAN.md. Correct only these review findings:

1. Routine same-account membership revalidation unmounts protected screens and
   loses drafts/forms. Preserve unsaved state across foreground/browser-focus
   and token refresh, while keeping initial loading, logout, account switches,
   and confirmed removal secure. Cover refresh errors/retries and block-state
   continuity as part of the same lifecycle fix.
2. Cancel invitation before the initial save completes leaves the eventual
   invitation persisted. Make cancellation complete reliably while retaining
   revision checks so it cannot remove a newer invitation.

Add permanent regression tests reproducing both findings, then demonstrate
they pass. Run typecheck, focused tests, the full existing suite, and lint;
review the diff. Use mocked/local services only. Report device/SQL checks as
pending unless actually performed in an authorized disposable environment.

Preserve all unrelated changes and the existing server-side policy protections.
Do not begin Slice 2. Do not access production, run remote migrations, deploy,
change EAS/credentials/env, commit, or push. V9 stays unapplied.

Update the implementation plan and review document with the fixes, changed
files, test results, and remaining QA. Complete the authorized local correction
without stopping at another plan, then provide a concise review handoff.
```
