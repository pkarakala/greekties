# Session 1 prompt

Paste the following into a fresh Codex chat attached to the same local workspace.
This prompt authorizes local implementation only when the user sends it.

```text
Implement the first approved Greek Ties pilot correction in:
/Users/pkarakala/Desktop/greekties

Read docs/PILOT_IMPLEMENTATION_PLAN.md first, especially "Slice 1: safe,
recoverable chapter entry." Treat it as the accepted product brief, then verify
the relevant current source and any applicable AGENTS.md instructions. Inspect
git status and preserve existing user changes.

Context:
- Private professional network piloting Sigma Phi Epsilon UCSB and Pi Beta Phi UCSB.
- Expo React Native, Expo Router, Supabase, Mapbox.
- TestFlight build 11 and Supabase V6/V7/V8 are live, as reported by the owner.
- The audit and product decisions are accepted. This is an implementation task,
  not another whole-repository audit or a request to stop after making a plan.

Implement only safe, recoverable chapter entry:
1. Persist invitation context appropriately on web and native through login,
   signup, email confirmation, restarts, and retries. Clear it after successful
   join or explicit cancellation/replacement, not before joining succeeds.
   Prevent stale async attempts from deleting a newer invitation.
2. Separate loading/error/no-profile/pending/approved/removed membership states.
   Avoid redirect races and loops; keep recovery, sign-out, and password reset usable.
3. Require explicit admin reinstatement after removal. A valid shared invite
   must not automatically approve a removed/rejected member. Preserve the
   one-chapter rule and all existing RLS, membership, and block protections.
   Provide a narrow usable admin reinstatement path if needed.
4. Keep organization name, chapter designation, and university recognizable
   through joining. Use inclusive language for both pilot chapters and provide
   useful invalid-invite, temporary-error, and wrong-chapter recovery.
5. Add meaningful regression tests and prepare deployment/verification notes.

Authorized: local app code, local tests, relevant documentation, and a NEW
unapplied migration file for the policy correction. Do not edit applied V6/V7/V8
migrations. Check the migration inventory before assigning the next version.

Not authorized: production database reads or writes, executing migrations on
any remote database, deployments, EAS changes, credentials/env changes, builds
or TestFlight uploads, git commits, pushes, merges, or messages to other people.
Run SQL acceptance tests only against a confirmed disposable local database.
If unavailable, prepare them and report them as unexecuted; keep making progress
on the local work. Do not use live Supabase credentials for UI verification.

Do not expand into Home/Me redesign, map consent, chat reliability, rich cards,
new analytics, Universal Links/hosting, or dependency upgrades. Those are later
slices. Make routine implementation decisions autonomously within this scope.

The source baseline intentionally permits rejected-member rejoining, and the
existing SQL acceptance test expects it. Update that expectation deliberately
as a policy change; verify unauthorized/cross-chapter reinstatement remains denied.
Do not mistake a UI gate for server enforcement or a drafted migration for a live fix.

Run typecheck, focused regression tests, the existing Jest suite, and lint.
Review the final diff. Validate native/web flows locally where feasible without
production access, and clearly separate executed checks from pending device/SQL QA.

Finish by updating docs/PILOT_IMPLEMENTATION_PLAN.md with changed files, test
results, outstanding verification, unapplied migration status, rollout ordering,
and the next slice. Report the behavior change and any material risks concisely.
Complete the authorized local work; do not deploy.
```
