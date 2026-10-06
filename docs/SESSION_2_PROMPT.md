# Session 2 prompt — explicit map consent

Paste into a fresh Codex chat attached to the same local Greek Ties workspace.
This prompt authorizes local implementation only when the user sends it.

```text
Implement Slice 2 of the approved Greek Ties pilot plan in:
/Users/pkarakala/Desktop/greekties

Read docs/PILOT_IMPLEMENTATION_PLAN.md and the latest acceptance entry in
docs/SLICE_1_REVIEW.md. Inspect current source, git status, and applicable
AGENTS.md instructions. Preserve all uncommitted Slice 1 work and documents.

Context:
- Pilot: Sigma Phi Epsilon UCSB and Pi Beta Phi UCSB, separate private networks.
- Expo React Native / Expo Router / Supabase / Mapbox.
- TestFlight build 11 and V6/V7/V8 are live, as reported by the owner.
- Slice 1 corrections are accepted locally, with 232 passing tests.
- V9 remains an unchanged, unapplied draft. SQL and device/browser QA are open
  release gates. Starting Slice 2 does not authorize deployment or close them.

Implement only explicit map consent and the stale-coordinate fix:

1. Separate the optional profile city from consent to appear on the alumni map.
   A member may retain a city in their chapter profile while map sharing is off.
   Explain that distinction accurately; do not describe the profile city as
   hidden from other chapter members if it is visible in the directory/profile.
2. Default map sharing off. Existing coordinates are NOT proof of prior consent.
   Provide an explicit persisted opt-in and a reliable opt-out. Prefer a small,
   explicit consent field if necessary to distinguish legacy coordinates from
   user-authorized sharing. Choose the smallest sound design after reading the
   schema; do not infer consent simply from non-null coordinates.
3. Explain approximate city-level sharing, who can see it, and how to turn it off.
   Use chapter-inclusive language. No device GPS permission or live tracking.
   Preserve admin-controlled alumni designation; do not make users alumni through
   this form or promise active members immediate alumni-map visibility.
4. Do not geocode city saves while sharing is off. Turning sharing off must
   remove the map location, including the current user's separately rendered pin,
   while retaining the profile city. Keep the state correct after restart.
5. On a changed/cleared city, never retain an old pin after geocoding failure,
   timeout, missing token, or no result. Save other valid profile edits with clear
   feedback; do not show a successful map update when it failed. Prevent a late
   lookup/save from restoring a pin after opt-out or a newer city selection.
6. Enforce the privacy contract at storage/API boundaries as needed, not only
   with a client map filter. Account for old clients that automatically geocode
   profile cities: they must not silently restore sharing after opt-out. Preserve
   existing chapter, membership, self-edit, and symmetric-block authorization.
7. Remove location/map participation from profile-completeness pressure. Skipping
   location must not prevent joining or using the rest of the app. Limit copy and
   form changes to this consent flow; do not redesign Home or Me.

Likely touchpoints:
- app/profile/edit.tsx and app/onboarding/complete-profile.tsx
- lib/profile.ts, lib/geocode.ts, lib/queries.ts, lib/types.ts
- app/map.tsx (including the self pin) and components/ProfileNudgeCard.tsx
- Relevant existing tests plus focused profile/map/privacy regression tests
- A NEW unapplied migration and SQL acceptance test if needed for durable consent
- supabase/migrations/README.md and the pilot implementation plan

Inspect actual V6/V7/V8 grants and V9 before designing the backend changes.
Do not modify applied migrations or rewrite V9. Use the next unused migration
version. Draft and explain the transition for existing coordinates: no automatic
opt-in, no production backfill performed here. The draft may specify the narrowly
necessary reset of legacy map coordinates while preserving profile city. Document
that transition explicitly for later deployment review. Missing consent support
must fail closed for sharing, with helpful UI rather than a permissive fallback.

Acceptance tests should cover:
- New/legacy profiles default off, including legacy non-null coordinates.
- City saved with sharing off makes no geocoding request and no map pin.
- Explicit opt-in with successful lookup persists and displays correctly.
- Opt-out removes both self and peer visibility and survives reload/restart.
- City cleared/changed, lookup timeout/no result/missing token, failed persistence,
  and late-response races never leave or recreate a stale pin.
- Active/alumni designation changes do not bypass consent.
- Existing block, chapter-isolation, and profile-edit protections remain intact.
- Old-client coordinate writes cannot re-enable sharing without explicit consent.
- Location is not required or rewarded as a mandatory completion task.
- Prior Slice 1 auth/draft/cancellation regressions continue to pass.

Authorized: local source, tests, relevant docs, and a NEW unapplied migration
draft if required. Complete the local implementation; do not stop after planning.

Not authorized: production access, remote database reads/writes or migrations,
deployments, EAS/env/credential changes, builds/TestFlight uploads, commits,
pushes, merges, or messages to others. SQL tests may run only against a confirmed
disposable local database. Use mocks/local services for UI tests and geocoding;
do not read live credentials or call the production backend for verification.
If local database/native/browser tools are unavailable, explicitly record which
checks were not executed and continue the rest of the authorized local work.

Do not start chat reliability, map clustering, Home/Me redesign, rich cards,
Universal Links, analytics, or dependency upgrades.

Run typecheck, focused regression tests, the full existing suite, lint, and diff
checks. Review the final diff. Update docs/PILOT_IMPLEMENTATION_PLAN.md with
changed files, tests, legacy-data handling, migration draft status, rollout order,
remaining SQL/device/browser gates, and the next bounded action. Report the
outcome concisely and bring it back for review. Do not deploy.
```
