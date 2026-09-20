# Slice 2 independent review — 2026-09-17

Verdict: accepted locally. No new blocking client finding identified in source
review and local regression checks. This is not migration or release approval.

## Reviewed behavior

- Optional profile city is separate from explicit map consent. Legacy coordinates
  do not imply consent. City/map participation no longer affects completeness.
- Both profile forms use the shared save flow. It clears the prior pin before
  lookup, skips geocoding when sharing is off, and reports partial saves without
  falsely confirming an opt-out when persistence is uncertain.
- Server revisions guard the initial consent write and lookup completion. Form
  revisions do not silently adopt background refreshes; obsolete lookups cannot
  restore a pin after a later consent/city/membership change under the drafted SQL.
- Peer pins, the separate self pin, and map counts require explicit consent and
  valid approved-alumni location data. Missing consent support fails closed.
- V10 drafts default-off consent, legacy-coordinate clearing, protected write
  privileges, owner-scoped RPCs, and invalidation. Existing membership, chapter,
  and block policies are preserved in the reviewed source. SQL execution is
  still needed to establish actual behavior and migration compatibility.

## Independent verification

- Typecheck passed (`npm run typecheck -- --incremental false`).
- Full Jest suite passed: **23 suites / 283 tests**, including Slice 1 regressions.
  Backend, geocoding, native map rendering, and persistence dependencies are
  mocked where specified by the tests; this does not establish device behavior.
- `git diff --check` passed.
- Lint was not rerun in this review; implementation reports 0 errors / 26 warnings.
- No application, migration, or SQL test edits were made during this review.
  Only review/handoff documentation was updated. No production access occurred.

## Open release gates

1. Execute all three SQL acceptance suites against a confirmed disposable local
   database with the full schema and migrations in order. Seed legacy coordinates
   before V10, verify they clear while city survives, and exercise real concurrent
   sessions as well as the sequential stale-revision assertions.
2. Verify native and browser consent, restart, focus, photo-picker return,
   keyboard/accessibility, lookup failures, and opt-out across devices. Complete
   all outstanding Slice 1 invite/auth and membership QA too.
3. Coordinate older-client replacement: V10 denies coordinate writes, so older
   clients that include coordinates in a profile update receive an error for the
   entire update. The reset also removes all legacy map pins until members opt in
   and save using the updated client. These are deliberate compatibility costs,
   not a transparent rollout. Cached data already read by another client cannot
   be retroactively removed; verify refresh behavior without promising realtime
   erasure from other devices.
4. V9 and V10 remain **unapplied**. After separate deployment authorization, V9
   then V10 must precede distribution of the dependent client. Never reapply
   earlier grants over V10 or restore legacy coordinates as a rollback.

Minor runbook cleanup to include before SQL execution: the header of
`supabase/tests/p0-authorization-invites.sql` says both "Requires V10" and "through
V9". Its current assertions require **V10**; follow the V10 README sequence.
This comment inconsistency does not change client behavior or local acceptance.

Next local implementation: Slice 3 only, using `docs/SESSION_3_PROMPT.md`.
The open release gates remain tracked while that work proceeds.
