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

## Independent rerun — 2026-09-22

The prior results were independently rerun in this session using the owner-
provided `/private/tmp/greekties-schema-capture/schema.sql`. Raw schema remains
private and outside the repository. Sanitization removed exactly the four
outbound-push trigger declarations; no top-level row `COPY` or `INSERT` data
statements remained. Sanitized derivative SHA-256:
`5b7bb75e7f51430f2018eb417f49bf26bfd9552bf464986934b189e324495bd7`.
This derivative differs from the September 19 derivative hash above because
the sanitizer output was freshly produced; both restore runs are documented.

Restored successfully to vanilla PostgreSQL 17.6 in a disposable Docker
container with network disabled, no exposed host ports and no mounted volumes.
After creating only the Supabase role/schema/extension prerequisites, applied
V9, V10 and V11 in order. V10 retained synthetic city, reset legacy coordinates
and sharing consent as expected; a deliberate second application failed without
changing the fixture. V11 assigned identities to synthetic legacy rows in both
message tables. All four suites listed above passed separately with
`ON_ERROR_STOP=1`. Five independent concurrent-session scenarios also passed:
delayed map completion after opt-out, competing same-UUID channel inserts,
rollback followed by same-ID retry, delete followed by retry without
resurrection, and membership revocation between preflight and insert.

The Supabase Postgres image finding was independently controlled. On
`public.ecr.aws/supabase/postgres:17.6.1.104`, a minimal unrelated function
revoked from `anon` caused the backend to terminate with signal 11. The same
control on `public.ecr.aws/supabase/postgres:17.6.1.095` returned the expected
permission-denied error and the server remained healthy. This isolates the
observed crash to the tested image behavior; it does not establish which image
is currently supported for deployment. Do not weaken function privileges to
work around it. The exact .104 behavior matches the upstream
[supautils issue #214](https://github.com/supabase/supautils/issues/214).

The report's suites and races therefore have independent local reproduction.
Still open: acceptance on the current supported Supabase stack, PostgREST query
semantics, Realtime ordering, production-scale V11 lock duration, rendered
browser UI, installed native picker, and exact-build physical-device flows.
No remote database, production data, credentials, EAS, build, or deployment was
used or changed.

### Supabase Postgres .136 acceptance — 2026-09-22

Also tested `public.ecr.aws/supabase/postgres:17.6.1.136` (linux/arm64,
PostgreSQL 17.6; digest
`sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`)
in a disposable network-disabled container. A clean test database was restored
using the image's `supabase_admin` role. V9, V10 and V11 each applied with
fail-on-error enabled. The same four SQL suites all passed, including expected
authorization-denial assertions; the message-retry suite emitted a non-fatal
`pg_temp` privilege warning. A minimal revoked-function call as `anon` returned
`permission denied` and the database stayed healthy. This confirms the .104
crash does not reproduce on the tested .136 image. The official self-hosted
Supabase Docker changelog currently names `.136` as its default image
([source](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md));
the exact managed-project image remains unknown. The reported upstream
[supautils issue #214](https://github.com/supabase/supautils/issues/214) remains
relevant context, but this run does not establish managed-project behavior.

PostgREST, Realtime, V11 lock duration at production scale, browser rendering,
installed native picker and exact-build device flows remain untested. All
containers created in this session were removed after the run.
