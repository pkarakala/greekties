# Slice 6 — distribution preparation and release verification

Updated 2026-09-22. **NO-GO for candidate distribution or pilot launch.** The
schema restore, V9–V11, four SQL suites and five concurrency cases have now been
independently rerun locally on isolated PostgreSQL 17.6. The matching Supabase
Postgres .104 permission-denial crash was reproduced with a minimal unrelated
function; .095 returned a normal permission error and remained healthy. Rendered
UI, current Supabase-stack integration, native picker, and browser/device release
verification remain open. No release approval is implied.

The saved [Session 6 prompt](SESSION_6_PROMPT.md) was carried out in the current
repository chat: the app rejected automated access to its own chat UI, so a
fresh chat could not be opened. No alternate route around that block was used.

## Decision and evidence

| Gate | Status | Evidence / next owner action |
| --- | --- | --- |
| Slices 1–5 source/component acceptance | Prior local PASS | [Slice 5 independent correction acceptance](SLICE_5_REVIEW.md): 34 suites / 564 tests, typecheck and diff checks passed; lint 0 errors / 24 warnings. Not rerun for these documentation edits. |
| Distribution preparation | Prepared, not activated | [Steward runbook](STEWARD_DISTRIBUTION_RUNBOOK.md) covers both UCSB chapters, install/join recovery, roles, support, unsent copy, and a manual funnel. Owner must fill placeholders and confirm real event/thread/mentor coverage. |
| Disposable SQL environment and base schema | Independently PASS | Owner-provided schema dump sanitized locally; restored in a no-network PostgreSQL 17.6 container with no host port or mounted volume. Current derivative SHA-256: `5b7bb75e7f51430f2018eb417f49bf26bfd9552bf464986934b189e324495bd7`. Four outbound-push triggers were removed from this derivative. |
| V9 → V10 → V11 locally; four SQL suites | Independently PASS on vanilla PostgreSQL and Supabase Postgres .136 | Migrations applied in order on both; all four suites passed separately with fail-on-error enabled. The message-retry suite emitted one temporary-schema privilege warning while its assertions passed. Managed-project PostgREST/Realtime acceptance remains open. |
| Concurrent SQL checks | Independently PASS on vanilla PostgreSQL | Five fresh concurrent-session cases passed: map opt-out race, duplicate UUID insert, rollback/retry, delete/no-resurrection, and membership revoke between preflight and insert. Supabase integration, PostgREST and Realtime remain unverified. |
| Supabase Postgres permission-denial control | .104 FAIL reproduced; .095 and .136 PASS controls | On `public.ecr.aws/supabase/postgres:17.6.1.104`, a trivial revoked function called as `anon` crashed the backend with signal 11. The same test on `.095` and `.136` returned the expected permission error; both servers stayed healthy. Official self-hosted config currently uses `.136` ([Supabase Docker changelog](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md)); the managed pilot project's exact image/runtime remains unknown. Do not weaken grants/revokes. |
| Rendered static/interactive browser QA | UNEXECUTED | Synthetic HTML exists, but the previously documented local-URL security denial remains unresolved. Owner provides a permitted inspection path; do not route around the denial. |
| Installed native picker and browser/device journeys | UNEXECUTED | Tool inventory finds Simulator and simctl, not a verified compatible candidate attached to an isolated backend. Owner provides that runtime and exact build identity. |
| Remote migrations / TestFlight candidate | Unverified historical state | V6–V8 live and TestFlight build 11 are owner-reported history. V9–V11 remain drafted/unapplied in project records; this session neither queried nor changed remote state. Build 11 does not establish picker compatibility or current client coverage. |
| Distribution/launch authorization | NOT GIVEN | Release owner reviews evidence, clears all gates, and separately authorizes rollout. |

## Checks actually executed in this session

- Read all five slice reviews, the Slice 5 implementation, pilot plan, migration
  README, Session 3/4 QA procedures, release documents, and relevant current
  invite/membership/admin/link/tab/map/picker/migration source. No applicable
  `AGENTS.md` was found in the repository or its ancestor paths.
- `command -v` found Node, npm, Supabase CLI, and xcrun. It did not find `psql`,
  `postgres`, `initdb`, `pg_ctl`, Docker, or Podman on PATH. Docker Desktop was
  started for the isolated database run; no global installation, CLI login, or
  remote status query was performed. All three containers created for this run
  were removed afterward.
- Both `/Users/pkarakala/Desktop/greek-ties-app-docs` and
  `/Users/pkarakala/greek-ties-app-docs` are absent. The repository SQL inventory
  has no base `chapters`, `profiles`, `mentorship_requests`, or mentorship
  `messages` CREATE TABLE artifact. Supabase local `config.toml` is absent.
  A full schema and policy/grant/trigger provenance remain prerequisites;
  isolated table guesses would not establish acceptance.
- `xcrun --find simctl` resolves to the Xcode developer tool. Computer-use
  inventory reports a running Simulator and browser access. No app was launched
  or attached to an unknown backend. The installed picker package is present;
  `package.json` declares 9.1.0. `app.config.ts` already has an EAS project ID
  and no iOS associated domains; no credentials or evaluated environment were read.
- Inspected the static fixture scripts and found their existing output at
  `/tmp/greekties-slice4-visual/index.html` and
  `/tmp/greekties-slice5-visual/index.html`. They replace services/icons and do
  not navigate. No regeneration, screenshot, browser rendering, installed QA,
  or new visual approval is claimed. The prior URL denial in the Slice 5 review
  was not retried or bypassed.
- The independent database re-run is recorded below and in
  [the dated database QA report](SLICE_6_DATABASE_QA_2026-09-19.md). It does not
  cover PostgREST, Realtime, lock duration at production scale, or client/device
  acceptance.
- Documentation validation: whitespace/fence checks for all
  eight changed/new Markdown files, local links introduced by this session,
  and comparison against 217 protected pre-edit file hashes passed. Full Jest,
  typecheck, and lint were not repeated for documentation-only changes.

**Failed acceptance tests:** the .104 Supabase Postgres permission-denial
control crashed as described above; it reproduced with an unrelated test
function and is an image-level finding. The four SQL suites and five races
passed on vanilla PostgreSQL. Runtime/browser/device checks remain unexecuted.

## Required database and client sequence

1. The schema was restored and migration/suite/concurrency checks rerun locally.
   Preserve the source/date, sanitizer scope and current derivative hash recorded
   in the dated database report. Keep the raw production-derived dump private.
   Do not query remote production or read app environment credentials to recreate
   it. A localhost proxy is not proof of isolation.
2. First inventory the artifact's included migration versions. An original
   pre-V1 base requires the explicit dependency order in the
   [migration README](../supabase/migrations/README.md) through V8. An authoritative
   snapshot already containing V1–V8 requires verification of those objects,
   not automatic replay. Apply only missing reviewed dependencies, then V9, in
   the disposable environment. Never execute a directory glob or reapply earlier
   grants to a later-version database. V9 denies invitation-based restoration of removed
   members and permits explicit authorized reinstatement without restored admin roles.
3. Seed synthetic legacy city/coordinates **before V10**. Apply V10 once; verify
   consent defaults off, coordinates clear, and city survives. Verify repeat
   application fails without clearing subsequent opt-ins. Older clients that
   include coordinates in profile updates fail the entire save; city-only edits
   still invalidate pins. Plan replacement/support before rollout. Do not restore
   legacy coordinates or reapply V6–V9 grants as a rollback.
4. Seed one legacy message in each table **before V11**. Verify both IDs are
   single-column UUID primary keys. Apply V11; inspect identity backfill and
   write-blocking lock duration. Reservations must commit/roll back with INSERT,
   survive message deletion, and remain inaccessible to clients. Old clients
   omitting IDs retain server-default UUID behavior. Do not prune the ledger or
   remove its triggers while retries may exist. V11 is not a rerunnable script.
5. With fail-on-error enabled, execute all four suites, recording each result
   separately: `p0-authorization-invites.sql`, `p0-membership-blocks.sql`,
   `pilot-map-consent.sql`, `pilot-message-retries.sql`. They write fixtures even
   though they roll back; never run them against production. The authorization
   suite's old “through V9” header conflicts with its V10 requirements; follow
   this combined sequence. The SQL file was preserved unchanged.
6. In concurrent local sessions verify stale location completion after opt-out,
   competing same-ID inserts, first-insert rollback, committed/lost-response
   send then deletion/retry, and access revocation between preflight and INSERT.
   Check uniqueness, no deleted-message resurrection, and reservation rollback.
   Also verify actual PostgREST search/counts/joins, block/channel boundaries,
   and Realtime ordering. Mocks cannot close these gates.
7. Complete isolated browser/native QA and independent review. Only after
   separate authorization may the operator verify remote inventory and apply
   missing V9 → V10 → V11 in order, **before candidate client distribution**.
   Do not replay owner-reported V6–V8 based on stale documents. Local migration
   success does not establish remote application.
8. Verify the exact candidate binary includes native picker 9.1.0 and native
   dependencies; package installation or a JavaScript update alone does not
   prove binary compatibility. Builds/uploads remain outside this session.
   Record candidate build, source revision, backend version, browser deployment,
   devices/OS, tester/date and evidence before approving invitations.

## Runtime QA to execute when isolated prerequisites exist

| Scenario group | Required exercise / acceptance evidence |
| --- | --- |
| Entry, both chapters and active/alumni | Invite → TestFlight install → reopen original invite or paste code; email confirmation and return/login; interrupted auth, cold/warm links, cancel/replace, failed persistence, invalid/revoked/expired links and retry. |
| Membership boundaries | No profile, pending, approved, removed, wrong chapter; authorized reinstatement; no private-content flash; same-account refresh retains drafts while hidden, account/logout/removal clears them; alumni designation is admin controlled. |
| Optional map | City without map, default off, opt-in/off and confirmed saves, lookup failure/stale response, self/peer visibility, reload/restart, designation change, blocks and cross-device refresh; real map rendering separately from fixture geocoding. |
| Chapter and mentorship messaging | Failed/uncertain send, newer typing, explicit Retry and inline Cancel/Discard, commit/lost response, deletion, navigation and focus, revoked access/logout; document that termination/reload ends memory recovery. |
| Home, Me and navigation | Populated/sparse/loading/empty/error/stale retry, long text and missing avatars; exactly Home/Chats/Events/People/Me; admin entry/return from Me, mentorship entry from Chats. |
| Events, directory, jobs and shares | RSVP unknown/visible counts, rapid writes/failure recovery; search beyond page one, combined filters/literal punctuation and obsolete pages; closed/missing/invalid job links; share with existing draft/failed send, blur/refocus while validation pending and after settlement, explicit append/cancel/Send without duplication. |
| Native and web date input | Create and edit: date-first/time-first, reopen partial choices, Done/dismiss without populating missing fields, Clear end time clears both fields and DST selection and saves null; required Start preserved, timezone changes, DST gap/repeated hour, unchanged instant. |
| Device/accessibility/operations | Small/large iPhones and browser widths, enlarged text, keyboard/focus, VoiceOver/screen-reader labels, Reduce Motion, actual icons, photo-picker return, offline/loading/error states; exact-build push allow/deny/tap/cold start/sign-out and notification inbox; report/block/account deletion on synthetic throwaways. |

For every run record expected/actual result, build and isolated backend identity,
device/browser/OS, synthetic role/chapter, and screenshot/log paths without
credentials. Capture application/SQL failures as reproducible findings for
independent review; do not change behavior, migrations, or tests to pass acceptance.

## Scope and next action

Added this report and the steward runbook; reconciled STATUS, LAUNCH_RUNBOOK,
APP_STORE_CHECKLIST, RELEASE_OPERATOR_CHECKLIST, README and the pilot progress
log. Historical evidence is retained and labeled. No application, migration,
dependency, or regression-test changes; no live data/credentials, EAS/env changes,
builds/uploads/deployment, commits/pushes/merges, or messages to others.

**Next bounded action:** resolve the .104 image crash against the current
supported Supabase image/runtime, then test PostgREST and Realtime. Separately
complete rendered browser, installed native picker and exact-build device QA.
Remote migration inventory/application remains a separately authorized operator
step. Do not fetch another production schema dump. Launch stays blocked.

## Independent preparation review — 2026-09-17

Accepted as distribution preparation, not completed release verification. Read
the readiness/runbook and release-document changes; independently confirmed all
217 protected files match the saved Session 6 baseline. Diff, Markdown fence,
trailing-whitespace, and local-link checks passed across the eight preparation
documents. Application tests were not rerun for documentation-only work. Tool
availability and remote state were not independently rechecked in this review.

The next action remains schema provenance and disposable-backend readiness,
followed by actual SQL/concurrency execution. The artifact handoff must include
its source, capture date, included migration versions and omissions, plus the
relevant tables, functions, policies, grants, triggers and service dependencies.
Use schema definitions, not member/message rows, passwords, or access keys.
A current schema snapshot is acceptable if its contents are inventoried; an
original pre-V1 artifact is not the only possible starting point. Do not assume
the snapshot's version from its filename. Missing prerequisites stay open.

The installed native picker and rendered/browser/device gates remain separate
from SQL acceptance. No production access or rollout is authorized by this review.

## Database run report review — 2026-09-22

The September 19 QA note changed the earlier “SQL unexecuted” status: it records
V9–V11, all four SQL suites and five concurrency scenarios passing on a
disposable PostgreSQL 17.6 database restored from a sanitized V8 schema
derivative. Its results have since been independently reproduced as recorded in
the next dated entry. The documented Supabase Postgres image crash
means the vanilla PostgreSQL pass does not close Supabase integration behavior.

Reviewed V9–V11 source and map/message SQL tests; no new blocking source finding
from that bounded read. At the time of this initial review, the schema and SQL
outputs were unavailable, so no SQL had been run. That state was superseded by
the following independent rerun. No remote database was accessed. Keep the raw
production-derived schema private.

## Independent rerun — 2026-09-22

The owner-provided schema was sanitized and restored in an isolated, no-network
PostgreSQL 17.6 container. V9–V11 and four SQL suites passed, as did five
concurrency checks; details and the derivative hash are in the
[database QA report](SLICE_6_DATABASE_QA_2026-09-19.md). The exact tested Supabase
Postgres .104 permission-denial crash was reproduced with a minimal unrelated
control function; .095 and .136 behaved normally. The .136 image restored the
schema, applied V9–V11 and passed all four SQL suites. The containers were
removed after the run. `git diff --check` passed for the three updated
documents. No app code,
migrations, tests, production/remote state, credentials, builds, or deployments
were changed.

Next: determine the currently supported Supabase Postgres image/runtime and
exercise its PostgREST and Realtime behavior; complete rendered browser, native
picker and exact-build device QA. Keep release NO-GO until all gates pass.
