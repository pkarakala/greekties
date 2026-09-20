# Slice 5 — local implementation handoff

2026-09-17. Implemented locally for independent review. This document is not
independent acceptance or release approval. No production access, credential
reads, remote database operations, migrations, EAS changes, builds, uploads,
deployment, commits, pushes, merges, or external messages occurred.

## Events and attendance

- Going / Interested / Can’t go map to the unchanged `going / maybe / declined`
  values. The selected response is also stated in text.
- Unknown counts are `null`; an unavailable own response is `undefined`, distinct
  from a successfully read absent response (`null`). Initial loading, missing or
  inaccessible event, failed details, partial attendance failure, real empty,
  category-filtered empty, and stale refresh have distinct UI states and Retry.
- Same-scope retry preserves event details and successful RSVP metadata. Cache
  scope includes account, chapter, membership status/designation, admin role,
  and known blocks. Event IDs further scope detail reads. Request generations
  reject obsolete reads; removed/inaccessible results clear prior details.
- RSVP has an immediate UI guard and a process-wide per-event/user write lock,
  including across remounts. An upsert must return the exact event/user/status
  acknowledgment. Empty, denied, or thrown acknowledgments trigger an authorized
  read of that mutable RSVP key. The desired *current response* must be observed
  before it is confirmed. This is intentionally different from message INSERT
  identity/retry handling. No automatic RSVP retry occurs.
- Confirmed writes update only the own-response state. Counts are never inferred
  from a stale local snapshot; they remain labeled as previous while refreshing.
  Failed writes preserve previous data and expose inline recovery. Obsolete
  account/event callbacks cannot adopt results or dispatch reconciliation reads.
- Two exact, RLS-scoped HEAD counts avoid a truncated row-list total. Copy says
  “RSVPs visible to you,” not chapter attendance. V8 can hide blocked responders;
  the existing RSVP policy can also retain visible RSVPs from former members.
  The preview separately requires approved same-chapter profiles. It reads at
  most four Going user IDs and only `id, user_id, name, avatar_url` from profiles;
  inaccessible profiles are omitted without looking up replacements or widening
  permissions. Counts and preview are separate snapshots, not an atomic census.
- Event updates/deletes require returned row acknowledgment. Delete has actual
  inline Cancel/Permanently delete controls, a synchronous guard, and stale
  confirmation/lifetime/focus checks. Job deletion uses the same UI approach.
  Uncertain deletion offers refresh/retry instead of claiming success.

## Time semantics

- Upcoming: start is strictly in the future, with no already-passed end.
  Happening now: start has arrived and a supplied end is still in the future.
  Ended: supplied end has arrived, or start has arrived with no supplied end.
  For no-end events the UI explicitly says the start passed and no end was
  provided. This is a conservative display rule, not an invented end timestamp.
- The agenda reads up to 100 candidates in deterministic start/id order and
  removes ended events. Start/end timers, a one-minute clock fallback, app
  activation/browser focus, and screen focus refresh keep classification current.
  Home’s already-correct future-only query and expiration behavior are unchanged;
  its event card now includes the displayed timezone.
- Create/edit share local-time parsing, formatting, start and optional end input.
  Display includes timezone abbreviations/offsets; entry shows the device IANA
  zone. Inputs produce UTC instants for storage. There is no event-zone column.
  A device timezone change during the form requires reopening before saving.
- Unchanged edits preserve the exact stored instant, including seconds and the
  later occurrence of a repeated hour. Calendar rollover and DST gaps fail
  validation. Repeated local times require an explicit first/second occurrence
  unless retaining an unchanged saved instant. Candidates cover non-hour DST
  changes too. End must be valid and strictly after start, or omitted entirely.
- Native uses `@react-native-community/datetimepicker` **9.1.0**. This matches
  both the installed Expo 56 `bundledNativeModules.json` and the
  [official Expo 56 documentation](https://docs.expo.dev/versions/v56.0.0/sdk/date-time-picker/).
  Web uses labeled native HTML date/time inputs plus the same validation and
  occurrence choices. This one dependency and its lock entry are the only
  package changes; npm’s unrelated lock metadata rewrites were removed.
- Saved details refresh on return. Organizers can share an update in chat;
  no automatic update announcement, push, recurrence, or timezone chooser added.

## People and Jobs

- Directory filtering runs **before pagination** across eligible chapter members.
  Pages contain at most 50 rows, sorted by name then unique profile ID. Text
  searches name/company/job title/city/role; mentor, hiring, and exact industry
  conditions combine on the server. Industry has an explicit text field so a
  value absent from the loaded page remains searchable. Main text input is
  debounced 250 ms; interim results are hidden instead of mislabeled.
- Search text is escaped first as a literal PostgreSQL regular expression, then
  as a quoted PostgREST value. Fixed columns/operators form the OR expression;
  punctuation, quotes, slashes, wildcard characters, and query-language-looking
  input cannot become operators. `imatch` avoids ILIKE’s `*` alias ambiguity.
  See [PostgREST operators and quoting](https://docs.postgrest.org/en/stable/references/api/tables_views.html).
- Query/filter/account/access changes reset pages and reject obsolete loads.
  Same-query refresh retains data, with errors visible above the list. Initial
  loading, no visible members, no matches, and search/page failures are distinct.
  A loaded count is labeled “loaded”; pagination has a usable explicit button.
  Slice 4’s repeated Jobs/mentor shortcuts remain; mentorship actions unchanged.
- Jobs distinguish failed loading from removed/inaccessible content and retain
  successful same-scope details during retry. Poster reads select only displayed
  profile fields, without email. Closed postings have no Apply action; absent
  or invalid links have explanatory copy. HTTP(S)/bare web addresses are
  validated, credentials/control characters/unsupported schemes rejected, and
  open failures appear inline. Ownership, admin, and block checks remain.

## Reviewed sharing and internal links

- Events/jobs expose Share to chat. Channel pages select only id/name/chapter.
  The existing `is_channel_visible` predicate checks each candidate before it
  is displayed: admin SELECT permissions alone do not establish send access.
  Resource, chapter, channel, and send visibility are rechecked when preparing
  a share and again before adding it to the draft. No new RPC was created.
- Choosing a channel opens its existing thread with a process-memory share
  token, concise title, and `/events/<uuid>` or `/jobs/<uuid>` path. The member
  presses Add to draft or Append to current draft, reviews the composer, and
  explicitly presses Send. No preparation or navigation sends a message.
- Share records belong to the existing account/conversation recovery entry.
  They never overwrite a draft or pending/failed attempt. Append uses the latest
  draft after access checks, not a captured draft. Cancellation, consumption,
  unmount/blur, account/chapter changes, revoked access, and obsolete callbacks
  invalidate insertion; revisiting a consumed token cannot append it again.
- Only complete supported detail paths with UUID-shaped IDs become accessible
  internal Expo links. Query suffixes, percent encoding, extra paths, external
  URLs, malformed IDs, and unrecognized routes remain plain text. Detail screens
  read targets under RLS and handle removed/inaccessible items gracefully.
- Recovery remains app-process/browser-page memory only. Existing stable-ID
  Send/Retry/Discard logic is unchanged. No private mentorship sharing, automatic
  sending, rich cards, attachments, previews, message columns, or invite changes.

## Exact file scope

Modified existing files in this session:

- `app/(tabs)/events.tsx`, `app/(tabs)/people.tsx`,
  `app/(tabs)/chats/[channelId].tsx`
- `app/events/[id].tsx`, `app/events/new.tsx`, `app/events/edit/[id].tsx`,
  `app/jobs/[id].tsx`
- `components/EventCard.tsx`, `components/NextEventCard.tsx`, `components/JobCard.tsx`
- `lib/events.ts`, `lib/time.ts`, `lib/jobs.ts`, `lib/queries.ts`, `lib/types.ts`
- `__tests__/lib/events.test.ts` (existing assertions retained; acknowledgment
  fixtures now supply the returned rows required by the strengthened writes)
- `package.json`, `package-lock.json`, `docs/PILOT_IMPLEMENTATION_PLAN.md`

New files:

- `lib/scoped-read.ts`, `lib/directory.ts`, `lib/job-application.ts`, `lib/chat-share.ts`
- `components/EventDateInput.tsx`, `components/EventDateInput.web.tsx`,
  `components/ShareToChat.tsx`, `components/ChatShareReview.tsx`,
  `components/ChannelMessageText.tsx`
- `__tests__/helpers/slice5-db.ts`,
  `__tests__/lib/slice5-events-directory.test.tsx`,
  `__tests__/lib/slice5-time-jobs.test.ts`,
  `__tests__/components/slice5-share.test.tsx`,
  `__tests__/components/slice5-event-forms.test.tsx`
- `scripts/qa/render-slice5.cjs`, this document

The session-start SHA-256 inventory is `/tmp/greekties-slice5-baseline.json`.
All existing Supabase migration/SQL files remain byte-for-byte unchanged,
including the previously uncommitted V9/V10/V11 and SQL acceptance changes.
Existing Slice 1–4 regression files are unchanged. Accepted auth/entry/invite,
map-consent, Home/Me, shared design primitives, and message recovery/transport
implementations were preserved. Narrow extensions to shared touchpoints above
retain the prior behavior. No earlier changes were reverted.

## Verification, evidence, and remaining gates

- Typecheck passed; focused Slice 5 and prior event/shortcut tests passed.
- Full suite: **33 suites / 538 tests passed** (463 previous + 75 added).
- Lint: **0 errors / 24 warnings**; no lint rules suppressed or downgraded.
- `git diff --check` passed; protected-file hash comparison passed.
- Tests include unknown/zero attendance, constrained preview, rapid/uncertain
  writes, stale reads and account/event/access changes, deletion controls on
  mocked web/iOS/Android, time boundaries, round trips, rollover and DST behavior
  in separate Los Angeles/Lord Howe processes, beyond-page-one search, combined
  filters/punctuation, obsolete pagination, retry, closed/invalid job links,
  sharing draft/attempt conflicts/cancellation/access loss/repeat navigation,
  and existing duplicate-safe message send regressions.
- `node scripts/qa/render-slice5.cjs` generates **52 static pages** from actual
  components with synthetic services, 360/820-point content widths, loaded,
  loading, empty, error, stale retry, unknown attendance, closed/missing-link
  jobs, date entry, and share-review fixtures. Output:
  `/tmp/greekties-slice5-visual/index.html`. Network/Supabase access is disabled;
  no Expo app was started and no credentials were read. Icons are substituted.
- **No rendered screenshots or visual acceptance.** Browser inventory succeeded,
  but opening the local fixture URL was explicitly blocked by the browser URL
  security policy. No alternate surface or indirect workaround was attempted.
  Enlarged text, actual icons, keyboard/focus, screen readers, runtime navigation,
  and the native picker still require real browser/device inspection. Static
  fixture generation and mocked platform tests do not establish those results.
- V9/V10/V11 remain **unapplied**. All four SQL suites, concurrent-session tests,
  and exact-build native/browser release gates from Slices 1–4 remain open.
  These tests do not establish PostgreSQL/RLS or actual native picker behavior.
- Backend limits: separate attendance reads are not one transaction; RSVP has
  no server revision for cross-device arbitration, and a client cannot cancel a
  request already executing remotely. No such guarantee is claimed. Directory
  offset pages can shift with concurrent profile edits and require refresh;
  substring search uses existing chapter/RLS scope, without a new search index.
  The agenda is bounded to 100 candidates, not an unlimited historical calendar.

Next bounded action: independently review this local Slice 5 diff and regressions,
then complete isolated rendered/device and disposable-database validation under
the existing QA handoffs. Do not infer release approval or start Slice 6
publication/distribution from this implementation.

## 2026-09-17 — Follow-up correction evidence

The two findings in `docs/SLICE_5_REVIEW.md` are corrected locally and await
independent review. This is not local acceptance or release approval; Slice 6
remains on hold.

- Share review now pauses its owned validation on blur/unmount and restores a
  usable explicit Add/Append on refocus. Validation ownership in the share helper
  prevents an older read/finally from inserting or changing a newer run. Drafts,
  pending/failed attempts, access guards, and explicit Send remain unchanged.
- Native date input now preserves date/time independently when one is missing.
  Picker-only defaults are not committed on opening/Done/dismissal. Optional End
  owns its clear control, closes its picker, and clears both fields plus DST
  occurrence. Stale callbacks cannot restore cleared fields. Create/edit pass
  `optional` only for End and submit null after removal. The existing web clear
  action moved with the component; HTML date/time entry remains intact.
- Corrected files: `components/ChatShareReview.tsx`, `lib/chat-share.ts`,
  `components/EventDateInput.tsx`, `components/EventDateInput.web.tsx`,
  `app/events/new.tsx`, and `app/events/edit/[id].tsx`. Added permanent actual
  focus/picker/form regressions in `__tests__/components/slice5-corrections.test.tsx`.
  Updated this document, the review, and the pilot plan; no other source scope.
- Four reproductions failed against the pre-correction source. All **26 new
  tests** pass. Focused checks: **5 suites / 135 tests passed**. Full suite:
  **34 suites / 564 tests passed** (538 prior + 26 new). Typecheck and diff checks
  passed; lint **0 errors / 24 warnings**. Prior tests were neither deleted nor
  changed. Comparison of 205 existing files outside the correction scope found
  no changes, including all SQL/migrations. Packages/lockfile are unchanged.
- These are component tests using actual input/review/form code with controlled
  focus, native-picker, and backend boundaries. They do not prove installed
  picker rendering, browser focus, accessibility, or real navigation. No new
  visual acceptance is claimed and the browser URL policy block was not retried
  or bypassed. All native/browser/SQL/concurrency gates remain pending.

See the appended correction section of `docs/SLICE_5_REVIEW.md` for reproduction
and lifecycle details. Next: independent correction review. All work remains
local; no production, remote database, credential, EAS, build, deployment,
commit/push/merge, dependency/migration, or external-message actions occurred.
