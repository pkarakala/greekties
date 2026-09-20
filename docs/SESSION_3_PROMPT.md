# Session 3 prompt — reliable message sending

Paste the prompt below into a fresh implementation chat attached to this workspace.
It authorizes local implementation only when the user sends it.

```text
Implement Slice 3 of the approved Greek Ties pilot plan in:
/Users/pkarakala/Desktop/greekties

Read docs/PILOT_IMPLEMENTATION_PLAN.md, the latest acceptance entry in
docs/SLICE_1_REVIEW.md, and docs/SLICE_2_REVIEW.md. Inspect applicable AGENTS.md,
current source, and git status. Preserve all uncommitted Slice 1 and 2 work.

Context:
- Private chapter networks: Sigma Phi Epsilon UCSB and Pi Beta Phi UCSB.
- Expo React Native / Expo Router / Supabase / Mapbox.
- Slices 1 and 2 are accepted locally; baseline is 23 suites / 283 passing tests.
- Owner reports TestFlight build 11 and V6/V7/V8 live. V9 and V10 are unapplied
  drafts. SQL acceptance and real native/browser QA remain open release gates.
- Preserve the calm cream/navy/gold design and Request mentorship terminology.

Implement only reliable text-message sending and recoverable drafts. Cover
chapter chat and the equivalent send/draft risk in accepted mentorship threads.
Do not redesign chat, add rich cards, or introduce general direct messaging.

Confirmed starting points to recheck:
- app/(tabs)/chats/[channelId].tsx clears its draft before awaiting send.
- lib/chat.ts returns no actionable send result and inserts a new server ID for
  each attempt. Realtime/response dedupe alone does not make a retry idempotent.
- app/inbox/[requestId].tsx clears before sending and restores old content on
  error, which can overwrite newer typing. lib/mentorship.ts inserts messages
  without a stable retry identity.

Required behavior:
1. A failed or uncertain send never silently loses the submitted text. Present
   calm, accessible pending/failed/uncertain feedback and an explicit retry.
   Keep send errors separate from thread-load errors so loaded messages remain
   usable. Never claim delivery merely because the request was dispatched.
2. Prevent rapid duplicate taps synchronously. Do not clear or overwrite newer
   text when an older request settles. Choose the smallest clear composer and
   failed-message model; avoid a general offline queue.
3. Give each logical send a stable identity, retained through retries. Account
   for a server commit followed by a lost response, realtime arriving before or
   after the response, and retries while confirmation is uncertain. Reconcile
   by identity with authorized reads; do not dedupe by text/time or treat every
   conflict as proof this exact message was delivered. A deliberate second send
   of identical text must still work. Do not use an upsert that can overwrite
   messages or require broader update permissions.
4. Preserve recoverable drafts and pending/failed attempt identity across
   same-account revalidation and ordinary navigation away/back during the app
   session. Isolate by account and conversation. Logout, account switch, and
   confirmed membership loss must discard inaccessible private state; late
   responses must not repopulate it or another thread. Do not send automatically
   on reopening a thread. Disk persistence and app-kill recovery are not required
   for this bounded slice; document the implemented retention boundary clearly.
5. Preserve chapter/channel visibility, accepted-mentorship participant checks,
   symmetric blocks, moderation, pagination, reactions, and server authorization.
   Re-check permissions through the server on retry; local recovery is never
   permission to send after membership/access has been revoked.
6. Handle thrown network failures, denied writes, missing/empty acknowledgments,
   and late responses without stuck spinners or unhandled rejections. Where the
   outcome remains uncertain, retain recovery state and accurate feedback.

Likely touchpoints:
- app/(tabs)/chats/[channelId].tsx and lib/chat.ts
- app/inbox/[requestId].tsx and lib/mentorship.ts
- A small shared send/draft helper or component if justified, lib/types.ts
- Focused helper/hook and actual composer regression tests
- docs/PILOT_IMPLEMENTATION_PLAN.md and relevant rollout documentation

Read actual message schemas, grants, and V6/V7/V8 policies before choosing a
retry design. Prefer existing immutable primary-key uniqueness if it safely
supports idempotent inserts. Do not assume a new migration is necessary. If one
is required, draft only the next unused version with focused SQL acceptance
coverage and explicit compatibility notes. Do not edit V1–V10 or weaken RLS.
No general dependency upgrades or broad refactoring.

Required tests:
- Successful send, empty input, rapid taps, denied insert and network rejection.
- Submitted draft recovery; newer typing survives older success and failure.
- Server commit with lost response then retry creates exactly one logical row.
- Realtime-before-response, response-before-realtime, duplicate events and
  delayed initial/history fetches do not duplicate or erase confirmed messages.
- An intentional second identical message is distinct from retrying the first.
- Navigation/revalidation recovery; channel/account changes, logout and revoked
  access ignore stale callbacks and never show another account's draft.
- Equivalent guarantees for accepted mentorship conversations.
- All previous Slice 1 and 2 regressions remain passing.

Use mocks/local services. SQL tests may execute only against a confirmed
disposable local database. Distinguish mocked retry tests from actual database
uniqueness/RLS verification; record unavailable SQL/device checks as pending.

Authorized: complete this local source/test/docs implementation, plus a new
unapplied migration draft only if required. Do not stop after proposing a plan.
Not authorized: production access, remote database reads/writes/migrations,
deployment, EAS/env/credential changes, builds/TestFlight uploads, commits,
pushes, merges, or messages to others. Do not read live credentials for testing.
Do not start Home/Me redesign, event changes, rich cards, notifications, or
distribution work. Existing release gates remain open.

Run typecheck, focused regressions, the full suite, lint, and diff checks.
Review the final diff. Update docs/PILOT_IMPLEMENTATION_PLAN.md with changed
files, exact retry/draft semantics, tests, any migration dependency, unexecuted
checks, and the next bounded action. Report concisely for independent review.
```
