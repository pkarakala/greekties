# Session 6 — distribution preparation and release verification

Paste the prompt below into a fresh chat attached to this workspace. Saving this
prompt does not execute it or authorize release.

```text
Work in /Users/pkarakala/Desktop/greekties on Slice 6: distribution preparation
and release verification. Preserve all uncommitted work and Slices 1–5.

Read applicable AGENTS.md, docs/PILOT_IMPLEMENTATION_PLAN.md, the Slice 1–5
review documents, docs/SLICE_5_IMPLEMENTATION.md, the migration README, and
docs/SESSION_3_QA_PROMPT.md and docs/SESSION_4_QA_PROMPT.md for QA procedures.
Those older prompts describe historical session order; this prompt supersedes
their instructions about when to begin later slices. Inspect current source.

Current evidence: Slices 1–5 accepted locally; 34 suites / 564 tests, typecheck,
and diff checks pass; lint 0 errors / 24 warnings. V9–V11 are drafted/unapplied.
All four SQL suites, concurrent SQL checks, rendered visual QA, native picker,
and real browser/device journeys remain open. TestFlight build 11 and live
V6–V8 are owner-reported historical state, not verified by this session.

Complete these bounded deliverables:

1. Reconcile release facts and prerequisites. Inspect available local tools and
   an authoritative already-local base schema. Follow SESSION_3_QA_PROMPT only
   when a confirmed disposable local database with synthetic data is available.
   Do not invent missing base DDL or use existing app environment credentials.
   Execute the documented migration sequence, four SQL suites, and concurrent
   tests if possible. Record passed, failed, and unexecuted separately. A local
   migration run does not mean remote migrations are applied.

2. Exercise available isolated/local browser and native QA. Cover invite to
   install to join for alumni and active members; interruptions and recovery;
   membership boundaries; map opt-out; chat/mentorship retry and discard; Home,
   Me and five tabs; RSVP/search/jobs; sharing with blur/refocus; and native
   date-first/time-first entry and optional-end clearing. Check small screens,
   enlarged text, keyboard, accessibility, and loading/empty/error states.
   Use synthetic data and an explicitly isolated backend/harness. Mocked tests
   and static fixture generation do not count as rendered or installed QA.
   Respect browser/security blocks; do not circumvent denied URLs or permissions.
   If prerequisites are unavailable, complete independent work and record the
   exact missing prerequisite and next owner action, without repeated retries.

3. Write one concise steward-led distribution runbook for Sigma Phi Epsilon,
   UCSB and Pi Beta Phi, UCSB. Distinguish TestFlight installation from chapter
   invitation. Include reopen-original-invite or paste-code recovery after
   installation, email confirmation, pending approval, and alumni designation.
   Use placeholders for unverified install URLs/invite codes and named stewards.
   Draft copy only: send no invitations or messages and create no live data.
   Include active/alumni steward responsibilities, support escalation, a real
   event/welcome thread/responsive mentors as launch prerequisites, and a manual
   chapter-level funnel: invited, installed, joined, useful action within 48
   hours, returned within seven days. Avoid a new analytics feature.

4. Reconcile docs/STATUS.md, docs/LAUNCH_RUNBOOK.md,
   docs/APP_STORE_CHECKLIST.md, RELEASE_OPERATOR_CHECKLIST.md, and README where
   they conflict with verified local facts. Preserve historical evidence;
   distinguish owner-reported remote state from independently verified state.
   Document V9 -> V10 -> V11 sequencing before candidate client distribution,
   V10 legacy-coordinate reset and older-client save compatibility, V11 message
   identity backfill, native-picker build compatibility, and all remaining
   operator gates. Do not mark any gate passed without evidence.

Save docs/SLICE_6_READINESS.md with a concise go/no-go matrix, concrete evidence,
blockers and next owner actions; update docs/PILOT_IMPLEMENTATION_PLAN.md.
Link the steward runbook from that report. Stop feature expansion. Capture any
application/SQL defects as reproducible findings for independent review rather
than changing behavior or weakening checks to make acceptance pass.

Authorized scope: local inspection, QA using available tools and confirmed
disposable local resources, isolated synthetic QA harnesses, and documentation.
No production/remote database access, live credential reads, EAS/env changes,
global tooling installation or machine service changes, builds/uploads,
deployments, commits, pushes, merges, or messages to others. Do not modify
application behavior, migrations, dependencies, or existing regression tests.
Do not invent schema provenance, URLs, steward identities, metrics, or results.

Run checks appropriate to any local changes; do not repeat the full suite just
for documentation. End with completed deliverables, checks actually executed,
remaining release blockers, and one next bounded action. Bring the summary
back to the review chat. This session is not authorization to launch the pilot.
```
