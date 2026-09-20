# Session 4 prompt — Home, Me, and shared visual foundations

Paste into a fresh implementation chat attached to this workspace. This prompt
authorizes the local implementation below when the user sends it.

```text
Act as a senior product designer and React Native engineer. Implement Slice 4
of the approved Greek Ties pilot plan in:
/Users/pkarakala/Desktop/greekties

Read docs/PILOT_IMPLEMENTATION_PLAN.md and the latest acceptance entries in
docs/SLICE_1_REVIEW.md, docs/SLICE_2_REVIEW.md, and docs/SLICE_3_REVIEW.md.
Inspect applicable AGENTS.md, current source, and git status before editing.
Preserve all uncommitted Slice 1–3 work and documents.

Context and boundaries:
- Pilot: Sigma Phi Epsilon UCSB and Pi Beta Phi UCSB, separate private networks.
- Expo React Native / Expo Router / Supabase / Mapbox.
- Slices 1–3 are accepted locally. Baseline: 28 suites / 435 passing tests;
  typecheck passes; implementation lint reports 0 errors / 24 warnings.
- V9/V10/V11 remain unchanged and unapplied. SQL acceptance and real browser/
  device QA remain open release gates. The owner explicitly chose to proceed
  with local Slice 4 before that validation session. Do not treat it as passed.

Implement one coherent product/design slice: useful Home, a complete Me profile
hub, five visible tabs for every member, and a restrained shared visual system.
Complete the implementation, not just an audit or proposed design.

Design direction:
Premium, prestigious, calm, exclusive, human-designed, professional alumni
network. Preserve Greek Ties' cream/navy/gold identity. Use system typography,
generous but purposeful spacing, clear hierarchy, and quiet surfaces. No generic
social feed, dashboard full of statistics, ornamental gradients, oversized
marketing hero, heavy shadows, or excessive pill-shaped cards. Instagram, X,
Meetup, and Partiful may inform interactions only; do not copy their branding,
layouts, colors, wording, or visual identity. No new image assets are needed.

1. Home: orient members and give them something useful to do.
- Show recognizable chapter identity: organization name, designation when
  available, and university. Reuse the existing chapter identity conventions;
  designation must not replace the organization name.
- Remove People you should know and the duplicated recent-joins activity list.
  Replace them with a short, predictable overview using existing authorized
  data: one upcoming event, up to two recent open job opportunities, and a compact
  entry into chapter conversations with accurate available activity information.
  Keep this a small set of useful sections, not a new mixed-feed framework.
- Every item opens its existing destination. Prefer concise, relevant actions
  over a large animated member-count hero. Keep network/map access discoverable
  through a modest link or summary; map participation stays optional.
- Keep notifications, profile editing/completion, and legitimate invite access
  discoverable without crowding the page. Do not invent activity, counts, unread
  messages, recommendations, or public/member invite privileges.
- Select a genuinely upcoming event for the Home teaser; do not label an ended
  event as Coming up. A narrow Home-selection correction belongs here, while
  RSVP, scheduling, and broad Events changes remain Slice 5.
- A section failing to load must not look like an empty chapter or erase the
  other successful sections. Preserve same-account loaded content during retry,
  distinguish initial loading/empty/error, and provide actionable recovery.
  Clear stale private content on account/chapter changes and preserve blocking
  and channel visibility. Query only needed fields with bounded results.

2. Me: make the member's profile the main content, with account controls below.
- Present avatar/name, chapter and membership designation, class year, role or
  professional title/company, industry, bio, LinkedIn, and relevant existing
  mentorship/hiring signals when available. Do not duplicate job title and role
  awkwardly or fill missing data with fabricated information.
- Make Edit profile the clear primary action. Use a modest completeness nudge
  for sparse profiles. City and map sharing must never affect completeness.
- Optional profile city may be displayed independently of map consent. Explain
  existing map participation accurately if surfaced; route changes through the
  existing consent form rather than introducing another write mechanism.
- Keep privacy/support/blocked members/legal/sign-out/account deletion below
  the profile. Preserve their safeguards and make touched controls work on web
  and native; do not introduce Alert.alert-only browser confirmations. Use local
  mocks for destructive-action verification, never a real account deletion.
- Add Admin access here only for authorized owners/managers. Preserve screen
  guards and server authorization; hiding an action is not authorization.

3. Navigation and communication discovery.
- Exactly five visible member tabs for all roles: Home, Chats, Events, People,
  Me. Hide the existing Admin tab for everyone and reach its existing screen
  from Me. Preserve admin deep links and nested routes; avoid unnecessary moves.
- Add a clearly labeled Mentorship conversations entry in Chats, opening the
  existing inbox. Any badge must reflect real available data and say whether it
  counts pending requests rather than pretending it is unread messages.
- Keep Request mentorship / Pending / Open conversation terminology. No Connect,
  generic DMs, combined-inbox rewrite, or changes to Slice 3's send/recovery logic.
- Jobs remain in People's existing Jobs segment. Home links must land correctly
  even when People is already mounted. If retaining Find a mentor, fix only the
  narrow route/filter synchronization needed for that shortcut to work reliably;
  directory search/pagination and broader mentor refinements remain Slice 5.

4. Shared visual foundations, applied to this scope.
- Standardize existing system type styles for screen titles, section titles,
  body, and metadata. Retain font scaling. Use the existing 4-point spacing scale.
- Navy primary buttons with light text; gold as restrained accent. Improve
  essential small text to at least 4.5:1 contrast on its actual background;
  essential icons/control boundaries need sufficient contrast as well. Measure
  the combinations instead of trusting existing color comments.
- Consistent card radii, subtle borders, minimal shadows, clear primary/secondary
  buttons, and coherent Ionicons. Do not replace the icon library or add fonts.
- Use minimum touch targets of 44 points, meaningful accessible labels, readable
  disabled/loading states, wrapping long content, and no fixed text containers
  that clip enlarged text. Respect Reduce Motion for any animation retained.
- Change shared tokens/primitives only where justified; inspect their effects
  on auth, profile/map forms, events/directory, and chat recovery. Do not restyle
  every screen or refactor unrelated components just because tokens changed.

Likely files (inspect first; not a mandate to edit every file):
- app/(tabs)/index.tsx, me.tsx, _layout.tsx, chats/index.tsx
- app/(tabs)/admin.tsx only if navigation handling needs a narrow adjustment
- app/(tabs)/people.tsx only for retained shortcut route/filter correctness
- lib/queries.ts and narrowly scoped Home read helpers using existing events,
  jobs, channels, mentorship, and chapter data/policies
- theme/colors.ts, typography.ts, spacing.ts; components/Button.tsx, Card.tsx,
  ScreenHeader.tsx, ProfileNudgeCard.tsx, NextEventCard.tsx, Avatar.tsx as needed
- Focused behavior tests and docs/PILOT_IMPLEMENTATION_PLAN.md

No new backend feature, migration, dependency upgrade, schema/RLS change,
analytics, rich chat card, Share to chat, attendee feature, recurring group,
tagging, scheduling redesign, onboarding rewrite, or distribution work.
V1–V11 must remain unchanged. Do not alter accepted invite, membership, map
consent, or message-recovery behavior to simplify the redesign.

Verification:
- Test actual Home/Me/Chats navigation and data behavior: both pilot chapter
  identities, admin/non-admin five-tab configuration, gated admin entry,
  mentorship discovery, existing-tab shortcuts, sparse/complete profiles,
  initial loading, empty, partial failure, retry, and stale responses after
  account/chapter changes. Test behavior rather than mirroring style constants.
- Run typecheck, relevant regressions, full suite, lint, and diff checks. Explain
  any new warnings. Preserve all prior regression coverage.
- Visually inspect with local synthetic fixtures/mock services where tooling
  permits: Home and Me loaded/sparse/loading/error states; Chats mentorship
  entry; five-tab/admin navigation; small/large viewports and enlarged text.
  Capture screenshots of rendered results when possible and check shared-token
  effects on representative auth, map-consent, and chat-discard controls. Do not
  call screenshots of mockups evidence of the implemented app. If no safe local
  runtime is available, record visual checks as unexecuted rather than starting
  the app against its existing remote backend or claiming device QA.

Authorized: local source, tests, relevant design/QA notes, and a safe isolated
fixture harness if needed. No production access, remote database reads/writes,
live credential reads, migrations, EAS/env changes, builds/TestFlight uploads,
deployment, commits, pushes, merges, or external messages. No Slice 5 work.

Update docs/PILOT_IMPLEMENTATION_PLAN.md with implemented behavior, changed
files, design decisions, exact checks, visual evidence/limitations, and remaining
SQL/device/browser release gates. Save any useful visual QA evidence references
in docs/SLICE_4_IMPLEMENTATION.md. Report concisely for independent review;
do not mark Slice 4 independently accepted or authorize release yourself.
```
