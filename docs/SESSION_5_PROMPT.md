# Session 5 prompt — pilot Events, People, and Jobs refinements

Paste into a fresh implementation chat attached to this workspace. This prompt
authorizes the local implementation below when the user sends it.

```text
Act as a senior product designer and React Native engineer. Implement Slice 5
of the approved Greek Ties pilot plan in:
/Users/pkarakala/Desktop/greekties

Read docs/PILOT_IMPLEMENTATION_PLAN.md, the latest acceptance entries in the
Slice 1–4 review documents, and docs/SLICE_4_IMPLEMENTATION.md. Read any newer
visual-QA/correction document if present. Inspect applicable AGENTS.md, current
source, and git status. Preserve all uncommitted prior work.

Context:
- Private chapter networks: Sigma Phi Epsilon UCSB and Pi Beta Phi UCSB.
- Slices 1–3 accepted locally; Slice 4 source/behavior independently accepted.
- Owner says they like what they see, agree with the visual corrections, and
  explicitly want Slice 5 next. Preserve the current visual direction and any
  documented corrections; do not reopen the design or invent unseen corrections.
- Latest independently checked baseline: 29 suites / 463 tests, typecheck and
  diff checks pass; lint 0 errors / 26 warnings. Recheck current source.
- V9/V10/V11 unchanged and unapplied. All four SQL suites, concurrent-session
  checks, and real native/browser release QA remain open. Owner visual approval
  is not evidence that those technical checks ran.

Implement this bounded pilot slice in priority order. Finish the local work;
do not stop at an audit or proposal. Preserve the cream/navy/gold system, calm
hierarchy, accessible controls, and five-tab navigation established in Slice 4.

1. Make event participation trustworthy.
- Display Going / Interested / Can't go, retaining the existing database values
  going / maybe / declined. No schema change for wording.
- RSVP read failures must never become a fabricated zero count or no response.
  Distinguish loading/unavailable metadata from a confirmed zero, and preserve
  previously loaded event details and RSVP information during same-scope retry.
- Serialize RSVP writes with an immediate guard. Prevent rapid taps, stale reads,
  late failures, navigation, and account/event changes from rolling back a newer
  result or adopting another member's state. Handle denied/empty acknowledgments
  and thrown failures. Reconcile uncertain writes before claiming success; an
  upsert of the existing event/user RSVP key is not the same as message INSERT.
- Show a clear attendance count and a modest preview of at most four Going
  attendees using existing authorized RSVP/profile reads. Fetch only needed
  profile fields. Retain chapter, approved-member, and symmetric-block rules.
  Describe counts according to their actual visibility scope; do not imply a
  chapter-wide total if RLS hides participants. Never expand permissions to
  obtain a count/avatar. No attendee-directory feature or new RSVP category.
- Surface load/save errors inline with a usable web/native retry. Keep real
  empty, filtered empty, partial failure, and initial loading distinct. Touched
  event delete/management controls must have actionable confirmations on web;
  preserve authorization and protect against duplicate/stale destructive actions.

2. Make event timing unambiguous without complex scheduling.
- Define and apply a simple Upcoming / Happening now / Ended rule using existing
  starts_at/ends_at. Do not keep ended events in Upcoming merely because they
  began in the last 24 hours. Do not invent an end time for events without one;
  document the chosen conservative display rule and keep Home's future teaser
  accurate. Recompute on focus/time transitions as needed.
- Unify create/edit date-time parsing and formatting. Show the timezone explicitly
  when entering and displaying times, save UTC instants, and preserve the instant
  when reopening/editing. Device-local entry with an explicit timezone label is
  acceptable; do not build a timezone chooser, recurrence, or scheduling system.
- Use suitable native date/time controls and an accessible web equivalent. Reuse
  installed capabilities where possible. If a small Expo-compatible date/time
  picker dependency is necessary, a narrowly scoped local addition and lockfile
  change are allowed; verify official compatibility first, document it, and do
  not upgrade unrelated dependencies or build/upload the app. Explicitly record
  native runtime verification as pending if that module cannot run locally.
- Reject invalid/rolled-over dates and silently shifted nonexistent local times.
  Cover daylight-saving transitions and any ambiguity the selected input method
  exposes. Do not promise an event timezone field that does not exist.
- Keep event updates simple: refresh saved details and let organizers share an
  update through existing chat. No automatic event-update push or announcement
  backend in this slice.

3. Make People search and existing shortcuts dependable.
- Directory search/mentor/hiring/industry filters must apply across eligible
  chapter members, not only currently loaded pages. Prefer bounded server-side
  filtering with deterministic pagination using existing indexes/schema. Escape
  user text correctly for the query API; no raw query-language interpolation.
- Reset pagination on query/filter/scope changes, debounce text input reasonably,
  and ignore stale searches/pages. Preserve prior data appropriately during
  refresh without mixing results from different queries or accounts. Distinguish
  no members, no matches, and failed search; never claim complete search over a
  partial locally loaded directory.
- Preserve Slice 4's repeated Jobs and mentor-shortcut behavior on mounted tabs.
  Keep Request mentorship / Pending / Open conversation and existing membership
  rules. No Connect, generic DMs, ranking, recommendations, or cross-chapter search.

4. Clarify Jobs actions.
- Show a clear closed state and prevent Apply on a known closed posting. For an
  open posting without a valid application link, explain that no application
  link was provided instead of showing a dead/misleading action. Do not invent
  a contact channel or permission to message its poster.
- Validate/safely open supported application URLs, report opening failures
  inline, and retain post ownership/admin controls and blocking. Distinguish
  unavailable/failed loading from not found. Minimize profile/poster fields in
  touched queries; don't fetch email when it is not displayed.

5. Add simple Share to chat for events and jobs using Slice 3's reliable composer.
- The member chooses an existing channel they can access. Revalidate resource
  and destination access; never list inaccessible channels or cross-chapter ones.
- Prepare a concise title plus a navigable internal detail link, then open the
  selected channel for review. The member explicitly presses Send. Do not send
  automatically, invoke external messaging, or add a parallel send mechanism.
- Integrate narrowly with existing account/conversation-scoped draft recovery.
  Never overwrite a draft or pending/failed attempt. Offer an explicit, safe way
  to append the share to the current draft or cancel. Repeated navigation and
  delayed callbacks must not insert the same share repeatedly or affect a newer
  account/conversation. Preserve stable-ID retry and discard semantics unchanged.
- Render recognized event/job links as accessible internal navigation in channel
  messages on web/native. Strictly validate supported routes/IDs and fall back
  to plain text for malformed/unrecognized links. Read target content under
  existing RLS when opened; handle removed/inaccessible resources gracefully.
- Plain text plus a link only: no rich cards, attachments, link-preview fetching,
  new message columns, notifications, generic auto-linker, or sharing to private
  mentorship threads in this slice. Do not alter invite-link parsing/recovery.

Likely touchpoints (inspect first; only edit what is required):
- lib/events.ts, lib/time.ts, app/(tabs)/events.tsx, components/EventCard.tsx,
  NextEventCard.tsx, app/events/[id].tsx, new.tsx, edit/[id].tsx; lib/home.ts
  only if needed to keep the already-correct future teaser consistent.
- app/(tabs)/people.tsx, lib/queries.ts, lib/jobs.ts, app/jobs/[id].tsx,
  components/JobCard.tsx; limited existing profile/mentorship action touchpoints.
- A small shared event-date input/helper and a small channel-share flow/helper;
  lib/links.ts, app/(tabs)/chats/[channelId].tsx, and narrowly scoped draft
  integration only as needed for internal links and reviewed sharing.
- Relevant focused tests, docs/SLICE_5_IMPLEMENTATION.md, and the pilot plan.

Read the V6–V8 RSVP/profile/channel/job policies and all relevant grants before
designing reads. Keep V1–V11 and SQL acceptance files unchanged. This slice should
use existing tables/policies, with no new migration/RPC/service-role fallback.
If a backend limitation prevents a requirement, implement the safe supported
behavior and record the precise gap for review; do not weaken authorization.

Meaningful acceptance coverage:
- RSVP unknown/zero distinction, rapid changes, failed/uncertain writes, reload
  races, and transitions across event/account/access scope.
- Attendance preview limits, blocked/inaccessible profiles, and honest counts.
- Event start/end boundary cases, no end time, create/edit round trip, invalid
  dates, displayed timezone, and daylight-saving behavior.
- Matching member beyond page 1, combined filters, punctuation in search,
  pagination reset, obsolete page rejection, empty/error/retry, and shortcuts.
- Closed/missing/invalid job application links and opening failures.
- Sharing with empty/existing draft and pending/failed attempt, cancellation,
  repeat navigation, account/access loss, usable internal links, malformed links,
  inaccessible destinations, and existing duplicate-safe send regressions.

Run typecheck, focused tests, the full suite, lint, and diff checks. Preserve
existing tests rather than deleting failing coverage. Inspect changed screens
with synthetic local fixtures if supported: small/large sizes, enlarged text,
keyboard/focus, icons, and loading/empty/error states. Capture rendered evidence
where possible; document unavailable visual/native checks honestly. Do not start
the app against its existing remote backend to obtain screenshots. Mock tests
do not establish PostgreSQL/RLS, actual native picker, or real-device behavior.

Authorized: local source/tests/docs and isolated local fixtures, plus only the
small date/time dependency addition described above if required. No production
access, remote database reads/writes, live credentials, migrations, EAS/env
changes, builds/TestFlight uploads, deployment, commits, pushes, merges, external
messages, or Slice 6 distribution work. Keep Slices 1–4 behavior intact.

Update docs/PILOT_IMPLEMENTATION_PLAN.md and save docs/SLICE_5_IMPLEMENTATION.md
with exact changed files, time/count/search/share semantics, dependency changes
if any, checks, visual evidence/limits, unresolved gaps, and the next bounded
action. Report concisely for independent review; do not self-approve release.
```
