# Slice 6 — distribution preparation and release verification

2026-09-17. **NO-GO for candidate distribution or pilot launch.** Local
documentation is prepared; SQL, concurrency, rendered UI, native picker, and
browser/device release verification remain open. No release approval is implied.

The saved [Session 6 prompt](SESSION_6_PROMPT.md) was carried out in the current
repository chat: the app rejected automated access to its own chat UI, so a
fresh chat could not be opened. No alternate route around that block was used.

## Decision and evidence

| Gate | Status | Evidence / next owner action |
| --- | --- | --- |
| Slices 1–5 source/component acceptance | Prior local PASS | [Slice 5 independent correction acceptance](SLICE_5_REVIEW.md): 34 suites / 564 tests, typecheck and diff checks passed; lint 0 errors / 24 warnings. Not rerun for these documentation edits. |
| Distribution preparation | Prepared, not activated | [Steward runbook](STEWARD_DISTRIBUTION_RUNBOOK.md) covers both UCSB chapters, install/join recovery, roles, support, unsent copy, and a manual funnel. Owner must fill placeholders and confirm real event/thread/mentor coverage. |
| Disposable SQL environment and base schema | BLOCKED | No authoritative base DDL or confirmed disposable database. Owner supplies a schema-only artifact with provenance and a synthetic local environment. |
| V9 → V10 → V11 locally; four SQL suites | UNEXECUTED | No SQL connection or migration execution. Execute the sequence below once prerequisites exist. |
| Concurrent SQL / actual RLS and Realtime | UNEXECUTED | Requires concurrent connections to the verified local backend, including its Supabase services. |
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
  `postgres`, `initdb`, `pg_ctl`, Docker, or Podman on PATH. No global installation,
  database startup, service change, CLI login, or remote status query was attempted.
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
- Documentation validation: `git diff --check`, whitespace/fence checks for all
  eight changed/new Markdown files, local links introduced by this session,
  and comparison against 217 protected pre-edit file hashes passed. Full Jest,
  typecheck, and lint were not repeated for documentation-only changes.

**Failed acceptance tests:** none executed, so none reported. Missing
prerequisites and denied UI access are blockers, not passing tests or newly
reproduced application failures. All SQL/runtime checks below are unexecuted.

## Required database and client sequence

1. Owner supplies an authoritative schema-only artifact with source/date and
   confirmation of a disposable local synthetic environment. Include base
   tables, auth/storage dependencies, UUID defaults/keys, policies, grants, and
   triggers. Do not read app environment credentials or fetch production schema
   in this session. A localhost proxy is not proof of isolation.
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

**Next bounded action:** the owner supplies the authoritative schema-only base
artifact with provenance and a confirmed disposable local synthetic database;
then execute the Session 3 QA sequence extended through V11 and all four suites
plus concurrency, saving actual results for independent review. Launch stays blocked.

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

## Verification Refresh — 2026-10-06

This dated addendum supersedes the 2026-09-17 statements above that local SQL
execution and the remote migration inventory were unverified. It does not
supersede the still-open browser, native, physical-device, or launch-approval
gates.

### Verified

- **Merged source:** `main` is `c165c7a8e3ed7511fa82892201a61f1d883cbdf7`
  (PR #4). GitHub CI passed typecheck, tests, and lint. In a clean detached
  checkout, `npm ci`, typecheck, 34 Jest suites / 564 tests, lint (0 errors / 24
  warnings), and iOS/web Expo bundle exports passed. Exports used placeholder
  public environment values; they are not signed native builds or deployment
  evidence.
- **Local SQL:** A local Docker container named `greekties-qa-standard` exposed
  only `127.0.0.1:55433`, used the `greekties_qa` database on PostgreSQL 17.6,
  and had V9/V10/V11 schema markers. All four SQL suites passed with
  `ON_ERROR_STOP=1`; each ended in `ROLLBACK`.
- **Additional concurrency:** A committed first-insert rollback left no message
  or reservation. Two real PostgreSQL sessions inserted the same channel
  message UUID concurrently: one committed; the other failed on the retry
  ledger's primary key. After deleting the committed message, retrying the same
  UUID failed and the message remained absent while its ledger identity
  remained. Synthetic account/chapter/channel/message fixtures were removed;
  post-cleanup checks returned zero fixtures. The container was stopped.
- **Read-only production inventory:** On 2026-10-06, the linked project had the
  V8 membership column, but lacked the V9 reinstatement RPC, V10 map-consent
  column, and V11 retry ledger. No production schema/data was changed.
- **Web distribution:** GitHub reports Pages disabled and no repository Actions
  variables; `https://pkarakala.github.io/greekties/` returned HTTP 404.
- **EAS:** Build 12 completed from source commit `4e30050` but is not submitted;
  Build 11 is the latest EAS submission. This does not establish current App
  Store Connect review status.
- **Dependency candidate:** Draft PR #5 has green CI. Its local clean install
  passes Expo SDK compatibility, typecheck, all 564 tests, lint, and iOS/web
  exports. It aligns compatible Expo patches and overrides
  `decode-uri-component` to 0.5.0. `npm audit --omit=dev` still reports 61
  findings (49 high, 12 moderate); do not characterize the audit as clean.
  The iOS bundle source map did not include `braces`, `micromatch`, `image-size`,
  `node-forge`, or `uuid`; this narrows JS bundle exposure but does not clear
  build-tool, native binary, or supply-chain risk.

### Still Open / Owner Actions

- Review PR #5. Its passing checks do not address all remaining audit findings.
- Enable/configure GitHub Pages and set the three public build variables used by
  the workflow (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  `EXPO_PUBLIC_MAPBOX_TOKEN`) before relying on invite web links.
- Review V10's deliberate legacy-coordinate clearing and default-off consent;
  authorize the production change window separately. Then apply only missing
  V9 → V10 → V11 in order and verify each step. Do not rerun V6–V8.
- The prior disposable-database report records the stale map completion and
  access-revocation race checks. Full PostgREST behavior, Realtime ordering,
  production-sized V11 lock duration, current native-picker compatibility,
  browser rendering/navigation, and physical-device journeys remain unverified.
- Verify the exact post-migration candidate build, its App Store Connect state,
  metadata, and real-device onboarding/chat/map flows before expanding TestFlight
  or approving launch.

**Decision remains NO-GO.** Local database and source checks now pass, but they
do not authorize production migrations, public web publication, candidate
distribution, or App Store release.
