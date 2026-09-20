# Slice 3 follow-up prompt — web discard recovery

Paste into the Slice 3 implementation chat. A fresh implementation chat can also
use this prompt with the same workspace. It authorizes only the local correction
when the user sends it.

```text
Fix the Slice 3 review finding in /Users/pkarakala/Desktop/greekties.

Read docs/SLICE_3_REVIEW.md and docs/PILOT_IMPLEMENTATION_PLAN.md. Inspect current
source, git status, and applicable AGENTS.md. Preserve all uncommitted work from
Slices 1–3, including V9/V10/V11 and existing tests. Do not start Slice 4.

Finding: components/MessageComposer.tsx uses Alert.alert for Discard saved message.
The installed react-native-web Alert.alert is a no-op. Failed/uncertain attempts
therefore cannot be discarded on web, and their existence disables new sends.
This affects both chapter chat and mentorship conversations. The independent
review reproduced it using both actual screens with the installed web Alert.

Implement a small, accessible confirmation that works on web and native (an
inline confirmation is acceptable). Preserve these guarantees:
- Clearly explain that discard removes only local recovery, not a message that
  may already have been sent. Do not claim it cancels an in-flight server write.
- Cancel leaves the saved attempt and newer draft intact.
- Confirm clears only the original intended attempt, keeps newer typing, and
  enables sending that draft when otherwise allowed.
- A confirmation opened for attempt A cannot discard a later attempt B. Guard
  settlement, retry/pending transitions, conversation changes, account changes,
  membership loss, and unmount while confirmation is open. Do not weaken the
  recovery store's existing identity/current-entry protections.
- Keep the existing Retry behavior, stable send IDs, and authorization checks.

Add permanent actual-composer regression tests for both conversation kinds,
including failed and uncertain attempts, cancel/confirm, preserved newer text,
and stale confirmation behavior. Exercise an actionable web confirmation; do
not validate web support merely by spying on Alert.alert or manually calling a
callback that a real web user cannot reach. Test native behavior too. If a real
local browser/native harness is unavailable, state that limitation accurately.

Limit changes to this new discard flow, its tests, and relevant documentation.
Do not redesign chat or fix unrelated pre-existing Alert call sites. V9/V10/V11
remain unchanged and unapplied; SQL/device/browser release gates stay open.

Run focused regressions, typecheck, the full suite (baseline 381 tests), lint,
and diff checks. Update docs/SLICE_3_REVIEW.md with correction evidence, preserving
the original finding, and update docs/PILOT_IMPLEMENTATION_PLAN.md. Report which
checks ran and what remains unverified; independent acceptance follows review.

No production access, remote database actions, migration application, deployment,
EAS/env/credential changes, builds, commits, pushes, merges, or external messages.
Do not start another slice. Complete this local correction rather than stopping
at a plan, then return a concise summary for review.
```
