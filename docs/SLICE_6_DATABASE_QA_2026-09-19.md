# Slice 6 database QA - 2026-09-19

This report records local, synthetic database validation only. It is not
authorization to apply migrations remotely or distribute a candidate build.
Production data and schema were not changed.

## Baseline provenance

- Source: schema-only `supabase db dump --linked` from the linked Greek Ties
  project on 2026-09-19, including `public`, `auth`, and `storage`.
- Original artifact: `/tmp/greekties-pre-v9-schema-2026-09-19.sql`, 6,070
  lines, SHA-256
  `00e8b71aa4e7478fcad010aa6b970c35e4f0f2b398cc1a7b08c8d1646ff95eac`.
- The artifact contained no `COPY` or `INSERT INTO` data statements. V8 markers
  were present; V9, V10, and V11 markers were absent.
- The raw dump includes production outbound-push trigger configuration and is
  mode `0600`; it must not be committed or shared.
- Local restore used a mode-`0600` derivative with the four outbound push
  triggers omitted so synthetic inserts could not call production. Its
  SHA-256 is
  `740fa19df206ffdb8fe58787acdbf2808f25961c6e0a304169712835692d6881`.

## Migration execution

The sanitized baseline restored successfully to a disposable PostgreSQL 17.6
database. The repository migrations were then applied in order:

1. `app-v9-pilot-reinstatement.sql`
2. `app-v10-explicit-map-consent.sql`
3. `app-v11-message-retry-identities.sql`

V9 created the reinstatement RPC, granted execution to `authenticated`, and
denied `anon`. Before V10, a synthetic approved alumnus had a city and legacy
coordinates. V10 retained the city, defaulted sharing off, cleared both
coordinates, created a revision, and correctly refused a second application
without changing the migrated row. Before V11, one synthetic legacy message
was inserted into each real message table. V11 backfilled both identities and
denied ledger reads to `anon` and `authenticated`.

## SQL acceptance

All suites ran separately with `ON_ERROR_STOP=1` and rolled back their fixtures:

- `p0-authorization-invites.sql`: PASS
- `p0-membership-blocks.sql`: PASS
- `pilot-map-consent.sql`: PASS
- `pilot-message-retries.sql`: PASS

## Concurrent-session checks

- Delayed map completion after a concurrent opt-out returned no revision;
  sharing remained off, coordinates remained null, and the revision advanced.
- Two simultaneous channel-message inserts with one UUID produced one committed
  message and one ledger row; the competing insert was rejected.
- A rolled-back first insert left zero messages and zero reservations; a later
  same-ID insert succeeded and produced one of each.
- A committed message followed by deletion could not be resurrected by a
  same-ID retry; the message remained absent and the ledger row remained.
- Membership revoked after an authorized preflight but before INSERT denied the
  message and rolled back its reservation; both counts remained zero.

## Environment finding

The matching Supabase Postgres image
`public.ecr.aws/supabase/postgres:17.6.1.104` terminated its server process with
signal 11 whenever `anon` invoked any function lacking EXECUTE permission. A
minimal unrelated control function reproduced the crash, so results from that
container were discarded. The four suites and concurrency checks above passed
on the plain PostgreSQL 17.6 container, which does not reproduce that image
defect.

## Remaining gates

- Independent review of this evidence and migration SQL.
- Actual PostgREST search/count/join behavior and Supabase Realtime ordering.
- Production-shaped V11 lock-duration assessment at the real table sizes.
- Rendered browser QA, installed native-picker verification, physical-device
  journeys, and exact candidate-build testing.
- Fresh remote migration inventory and explicit rollout authorization before
  applying only missing V9, V10, and V11 in order.

Release remains **NO-GO** until these gates are closed.

## Admin authorization race follow-up — 2026-10-06

An independent review found concurrent role-change races in the V8
`set_chapter_member_membership_type` RPC and the V6 `reject_chapter_member`
RPC. On the disposable PostgreSQL 17.6 database, an owner transaction
promoted a regular member to manager while a manager call was in flight. The
pre-fix membership RPC still changed the new manager's designation
(`manager:alumni`); the pre-fix reject RPC still removed the new manager
(`rejected:null`).

The un-applied V9 migration now replaces the approval, rejection, admin-role,
and membership-designation RPCs with actor row locks and `FOR UPDATE` on the
target before checking authorization. Repeating the membership overlap made
the manager call wait, re-read the promoted role, and reject; the target
remained `manager:active`. Repeating the rejection overlap also made the
manager wait and reject its stale request; the target remained
`approved:manager`.

After applying the revised V9 to the disposable database, all four SQL
acceptance suites passed again with `ON_ERROR_STOP=1` and rolled back their
fixtures. The synthetic race fixtures were explicitly deleted and verified at
zero; the QA container was stopped. Production was not changed.

## Acceptance rerun — 2026-10-06

After the PR #4 merge, the disposable PostgreSQL 17.6 container was restarted
and its current V9 function definitions were checked: all four admin RPCs
contain actor `FOR SHARE` and target `FOR UPDATE` locks. The four acceptance
suites (`p0-authorization-invites.sql`, `p0-membership-blocks.sql`,
`pilot-map-consent.sql`, and `pilot-message-retries.sql`) were rerun with
`ON_ERROR_STOP=1`; each exited successfully.

This database contains a pre-existing synthetic QA baseline (3 profiles, 1
chapter, 3 auth users, and 5 durable retry identities). These rows were
preserved. The counts were unchanged after the acceptance rerun, whose fixtures
are transactional. The container was stopped again. No production schema,
data, or credentials were touched.
