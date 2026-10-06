# Next session — local validation after Slices 1–3

Paste into a fresh chat attached to this workspace. The prompt authorizes local
validation only when the user sends it.

```text
Prepare and execute local validation for Greek Ties Slices 1–3 in:
/Users/pkarakala/Desktop/greekties

Read docs/PILOT_IMPLEMENTATION_PLAN.md, docs/SLICE_1_REVIEW.md,
docs/SLICE_2_REVIEW.md, docs/SLICE_3_REVIEW.md, and the migration README.
Inspect applicable AGENTS.md and git status. Preserve all uncommitted work.

Slices 1–3 are independently accepted locally: 28 suites / 435 tests and
typecheck pass. V9/V10/V11 remain unapplied drafts. All four SQL suites and
real native/browser QA remain pending. This session is validation, not Slice 4.

Establish prerequisites first:
- Inspect available local PostgreSQL/Supabase/container and browser/device tools.
  Previous sessions found no psql or Docker on PATH; recheck availability.
- Locate an authoritative, already-local base-schema artifact, including the
  known related greek-ties-app-docs directory if present. Pre-existing table DDL,
  especially mentorship messages, is missing from this repository. Do not invent
  schema and claim production-equivalent acceptance. Do not search credentials
  or retrieve schema from a remote database.
- Verify that the test database is disposable, local, and contains synthetic
  data before fixture/migration execution. A localhost proxy alone does not
  establish this. Do not use the app's existing environment as a test backend.

If prerequisites exist, follow the documented dependency order:
1. Load the authoritative base schema and required prior migrations into the
   disposable environment. Inspect seeds/dependencies; do not blindly execute a
   directory glob or reapply old grants over V10.
2. Apply V9 locally, seed legacy city/coordinates, then V10. Verify default-off
   consent, cleared coordinates, and retained profile city.
3. Seed a legacy message in each message table before V11. Apply V11 locally;
   verify identity backfill and assumed UUID primary keys.
4. Run all four suites: p0-authorization-invites.sql, p0-membership-blocks.sql,
   pilot-map-consent.sql, pilot-message-retries.sql. Record actual results.
5. Use concurrent local connections to test stale map completion after opt-out,
   competing inserts with one message ID, first-insert rollback, committed send
   with lost response followed by deletion/retry, and access revocation. Verify
   uniqueness, no deleted-message resurrection, and reservation rollback.

With a verified local backend and compatible runtime, exercise synthetic members
from two separate chapters in browser/native flows:
- Invite recovery, cancellation/replacement, membership states, reinstatement,
  and same-account refresh without losing drafts.
- Optional city, map opt-in/off, failed/stale lookups, self/peer visibility, and
  restart persistence. Distinguish fixture geocoding from real Mapbox QA.
- Chapter/accepted-mentorship sends, uncertain recovery, retry, inline discard,
  newer drafts, navigation, and logout. Chat recovery intentionally ends when
  the app process or browser page terminates.
- Keyboard/focus, screen-reader controls, enlarged text, and layout where the
  actual environment supports them. Mocked platform tests are not device QA.

Authorized: disposable local setup/fixture execution using available tooling,
isolated local test harness files/config, and relevant QA documentation. Keep
test configuration separate from production. Do not install global tooling or
change machine services in this session. Do not edit application behavior or
V1–V11 to make failures pass; capture reproductions for review.
No production access, remote database actions, live credentials, deployment,
EAS/env changes, builds/TestFlight uploads, commits, pushes, or external messages.

If tooling, authoritative schema, or a runtime is unavailable, complete the
independent checks that are possible and report exact missing prerequisites and
the next owner action. Do not repeatedly run mocks as a substitute for SQL QA,
fabricate schema provenance, or loop on unavailable tooling. An owner-supplied
schema-only artifact may be needed; that is not permission to query production.

Save docs/SLICES_1_3_QA.md and update the progress log. Separate passed, failed,
and unexecuted checks. Record whether migrations ran only in a disposable local
database; remote draft status remains unchanged. Report code findings and the
next bounded action. Do not start Slice 4 or deploy. Bring the summary back to
the review chat.
```
