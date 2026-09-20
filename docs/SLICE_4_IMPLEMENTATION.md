# Slice 4 — local implementation handoff

2026-09-17. Implemented locally for independent review, **not independently
accepted or cleared for release**. No production access, credential reads,
remote data actions, migrations, builds, dependency changes, commits, pushes,
merges, or external messages. Slices 1–3 retain their acceptance and release gates.

## Delivered behavior

- Home shows full organization name, designation when present, and university.
  The large animated statistics hero, suggested members, and duplicate recent
  joins are replaced with one future event, up to two recent open jobs, and the
  latest available message's channel and timestamp. Each teaser opens its
  existing detail/thread; section links open Events, People → Jobs, and Chats.
- Event selection requires a future start and a null/future end. A start-time
  timer refreshes Home and hides the expired teaser even when refresh fails.
  No RSVP, event scheduling, or broad Events behavior was changed.
- Chapter, event, jobs, and conversation reads fail independently. Initial
  loading, true empty, and error have different copy. Retry targets that section;
  refresh retains successful same-scope data and labels stale information.
  Account, chapter, status, membership/admin designation, and block-list changes
  invalidate private cached content. Older responses cannot overwrite the new
  scope. Focus and pull-to-refresh revalidate the overview.
- Home reads select only displayed fields; results are bounded to one chapter,
  one event, two jobs, and one message. Block exclusions are applied before
  limiting results. Conversation activity uses a joined, chapter-filtered channel
  under existing message/channel RLS. No unread badges, recommendations, fake
  activity, membership statistics, or new policies were introduced. Missing
  job-open support is an actionable error, not an unfiltered jobs fallback.
- Notifications, profile completion, network breakdown, and optional alumni map
  access remain discoverable. Only approved owners/managers see the invitation
  shortcut to existing Chapter settings. No invite is fetched or minted on Home.
- Me presents name/avatar, chapter, membership designation, class year,
  professional title (falling back to role) and company, industry, optional city,
  bio, LinkedIn, and existing mentorship/hiring signals. Missing fields stay
  absent. Edit profile is the primary action; the existing five-field
  completeness calculation is reused unchanged. City/consent do not count.
- Map status distinguishes an actual eligible pin, enabled sharing without an
  eligible location, and off. Manage map sharing opens the existing profile form;
  no new write path was introduced.
- Account/privacy/blocked members/support/legal/sign-out/delete controls sit
  below the profile. Link, sign-out, and deletion failures appear inline.
  Deletion has visible Cancel/Permanently delete controls on web and native,
  prevents duplicate submissions, and ignores delayed outcomes after unmount or
  account/access-scope changes. Verification only called a mocked deletion RPC.
- Exactly five member tabs remain: Home, Chats, Events, People, Me. Admin is
  hidden for every role and exposed in Me only for approved owners/managers.
  Existing admin screens, guards, nested routes, and server authorization remain.
- Chats has an always-discoverable **Mentorship conversations** entry to `/inbox`,
  including while channels load. It has no badge. Full chapter identity is
  restored, channel failures have Retry, and a channel-created timestamp no
  longer appears as message activity. Send/retry/discard logic is untouched.
- People consumes shortcut parameters so a repeated Jobs shortcut works after
  manual segment changes on an already-mounted tab. Existing mentor deep links
  switch to Directory and reapply the mentor filter, clearing conflicting local
  filters. Search and pagination implementations are unchanged.

## Design and shared primitives

Cream/navy/gold remain; existing system `h1`, `h2`, `h3`, body, and metadata
styles and the four-point spacing scale are reused. Home/Me have a bounded
760-point content column, quiet section headings, wrapping text, subtle borders,
and no large hero, heavy shadows, or new imagery/fonts.

Buttons use navy with cream text, 12-point corners, minimum 48-point height,
vertical padding, wrapping labels, and a readable disabled/loading surface.
Secondary buttons and text fields use the stronger control-boundary token.
Cards retain their existing 16-point radius and subtle decorative border;
pressable cards have at least 44-point height. No press-scale motion remains in
Button/Card; Avatar's image transition was removed and fallback initials grow
with font scale. Existing map-consent and message-recovery component logic was
not edited. Shared token effects on those controls, auth, events, and directory
were inspected in source and covered by the existing regression suite; rendered
visual and accessibility checks remain pending below.

Run `node scripts/qa/measure-slice4-contrast.cjs` to reproduce WCAG relative
luminance measurements. `goldSoft` is alpha-composited over actual cream.

| Foreground | Cream | Card surface | Pressed surface | Gold tint |
| --- | ---: | ---: | ---: | ---: |
| Navy | 12.86 | 14.13 | 11.56 | 11.28 |
| Gold | 5.79 | 6.37 | 5.21 | 5.08 |
| Secondary text | 5.85 | 6.42 | 5.25 | 5.13 |
| Metadata text | 5.28 | 5.80 | 4.74 | 4.63 |
| Error/destructive | 5.78 | 6.35 | 5.19 | 5.07 |
| Green | 5.73 | 6.30 | 5.15 | 5.03 |
| Blue | 5.52 | 6.07 | 4.96 | 4.85 |
| Essential control boundary | 3.49 | 3.84 | 3.14 | 3.06 |

Ratios are `:1`. Cream on navy is **12.86:1**. The faint decorative card border
is intentionally separate from essential input/button boundaries.

## Changed files in this session

- Screens: `app/(tabs)/index.tsx`, `me.tsx`, `_layout.tsx`, `chats/index.tsx`,
  and the narrow shortcut synchronization in `people.tsx`.
- Reads/status: new `lib/home.ts` and `components/ReadStatus.tsx`.
- Shared visual changes: `theme/colors.ts`, `components/Button.tsx`, `Card.tsx`,
  `Avatar.tsx`, `TextField.tsx`. Existing typography and spacing tokens unchanged.
- Tests: new `__tests__/components/home-profile-hub.test.tsx` and
  `__tests__/helpers/home-db.ts`.
- Local QA: `scripts/qa/render-slice4.cjs`,
  `scripts/qa/measure-slice4-contrast.cjs`, this document, and pilot-plan log.

A session-start SHA-256 inventory was retained in
`/tmp/greekties-session4-baseline.json`. Comparison confirms every existing
migration/SQL file, Slice 1–3 review/prompt, prior test, and accepted entry,
consent, and message-recovery implementation is unchanged. Me was intentionally
extended in this slice, retaining sign-out error recovery. Existing unrelated
uncommitted work was not reverted. Git diff includes earlier sessions; the list
above identifies only this session's scope.

## Verification and limits

- `npm run typecheck`: passed.
- New actual-screen/read-hook tests: **28 tests passed**. They cover both pilot
  identities; loading/empty/partial failure/retry/stale responses; event expiry;
  bounded/blocked queries; navigation; complete/sparse Me; city independence;
  admin/non-admin tabs/actions; existing-tab shortcuts; mentorship discovery;
  web/iOS/Android inline deletion with mocked services; support/legal failures;
  and late deletion/account transitions.
- Full `npm test -- --runInBand`: **29 suites / 463 tests passed**, preserving
  all 435 prior tests. Existing non-fatal Expo Go push warning remains.
- `npm run lint`: **0 errors / 26 warnings**. Two new
  `react-hooks/set-state-in-effect` warnings reflect intentional section-request
  state initialization (`lib/home.ts`) and applying an external mentor shortcut
  to local filters (`people.tsx`). The prior People route-sync warning remains.
  No rules were suppressed or downgraded.
- `git diff --check`: passed. Session-start hash comparison: no migration,
  prior-test, Slice 1–3 handoff/review, or accepted core-behavior file changes.
- Contrast script: all measured essential text combinations ≥4.5:1; all measured
  essential control boundaries ≥3:1.
- `node scripts/qa/render-slice4.cjs`: generated **13 static HTML pages** from
  actual React Native Web screen components with synthetic read/auth services:
  Home and Me loaded/empty/loading/error/stale-retry, Chats, Login, and shared
  profile/map controls. Regenerates at `/tmp/greekties-slice4-visual/index.html`.
  The harness forbids Supabase access, overrides fetch to throw, and emits a
  restrictive CSP. It does not start Expo or read credentials. Icons are
  explicitly substituted, and static controls do not establish runtime routing.
- **No screenshots captured; visual review unexecuted.** The browser connector
  reported no browser available. Native Chrome inspection was then blocked by
  pending macOS Accessibility/Screen Recording permissions. Generated HTML is
  not screenshot evidence or a claim that the app passed visual QA.
- Small/large viewports, enlarged text, real five-tab/admin navigation, actual
  Ionicons, VoiceOver/focus, native keyboards, map switches, and chat discard
  controls still require rendered browser/device inspection. Component tests
  exercise the real discard controls, but are not visual evidence.

## Remaining release gates

V9/V10/V11 remain **unchanged and unapplied**; V1–V8 are unchanged. All four SQL
acceptance suites and concurrent-session policy checks remain pending on a
confirmed disposable database. Validate the joined Home query against that
schema/RLS, especially custom/exec/alumni channel visibility and blocking.
Real invite/auth/storage/map-consent/message recovery and exact-build native/
browser QA remain open. No Slice 5 work, distribution, or release was authorized.
Next: independent Slice 4 review, followed by the already-tracked local SQL and
real browser/device validation session.
