# Greek Ties — Mobile App

LinkedIn for Greek life. React Native (Expo) frontend on the shared Supabase backend.
See the orientation docs in `../greek-ties-app-docs/` (`CLAUDE.md`, `START_HERE.md`, `docs/`).

## Status

### Phase 0 — foundation ✅ verified
Expo SDK 56 / RN 0.85.3 / React 19.2.3 on Node 24.17.0. `npm install` clean ·
`tsc --noEmit` clean · `expo config` resolves · `expo export` bundles cleanly.

- Config: `package.json`, `app.json`, `tsconfig.json`, `babel.config.js`.
- `theme/` — colors, spacing, radius, typography (from `docs/DESIGN_SYSTEM.md`).
- `lib/supabase.ts` — Supabase client with secure-store session persistence.
- `.env` / `.env.example` — env vars (`EXPO_PUBLIC_*`); real keys are NOT committed.

### Phase 1 — auth (the gate) ✅ typecheck + bundle verified
- `lib/auth.tsx` — `AuthProvider` + `useAuth`: restores the persisted session,
  subscribes to `onAuthStateChange`, loads the user's `profiles` row.
- `app/_layout.tsx` — auth gate: logged-out → `/login`, logged-in on an auth screen → `/`.
- `app/login.tsx` — email/password `signInWithPassword`.
- `app/signup.tsx` — `signUp`, carries an invite `code` through, handles email-confirm.
- `app/join/[code].tsx` — resolve chapter by invite code, instant join (no approval gate).
- `app/(tabs)/` — minimal Home + Me shell so auth has a landing (Phase 2 expands this).
- `components/` — `Button`, `TextField`, `Wordmark` (design-system primitives).

### Phase 2 — shell + home ✅ typecheck + bundle verified
- `app/(tabs)/_layout.tsx` — Robinhood-style bottom bar: Home, Chats, People, Admin
  (owners/managers only via `href: null`), Me. Gold active tint, haptics on tab press.
- `app/(tabs)/index.tsx` — the showcase home: animated **Network Net Worth** hero
  (count-up), quick actions, alumni-map teaser, "People you should know" rail, and
  recent activity — all from live `profiles` data. Pull-to-refresh + no-chapter empty state.
- `app/profile/[id].tsx` — lightweight read-only member profile (Phase 3 adds actions).
- `lib/queries.ts` — `useHomeData`: member count, distinct industries, new-this-month,
  suggested connections, recent joins.
- `components/` — added `Card`, `Avatar`, `Badge`, `StatPill`, `MemberCard`,
  `AnimatedNumber` (Reanimated count-up), `ComingSoon`.
- Placeholders: `chats`, `people`, `admin` tabs (built out in Phases 3–6).

### Phase 3 — network screens ✅ typecheck + bundle verified
- `app/(tabs)/people.tsx` — **directory**: searchable + filterable (mentors / hiring /
  industry chips) member list, with a Directory|Jobs segmented toggle (Jobs → Phase 5).
- `app/profile/[id].tsx` — full member profile with **Request mentorship** (inline
  composer), existing-request awareness (pending / open conversation), and LinkedIn.
- `app/map.tsx` — **alumni map** (`@rnmapbox/maps`, dark style, gold pins → profile).
  Falls back gracefully when no Mapbox token is set.
- `app/inbox/index.tsx` + `app/inbox/[requestId].tsx` — **mentorship inbox**: incoming
  / outgoing requests, accept/decline, and a message thread (composer enabled once accepted).
- Home now links the inbox icon (with a pending-request badge) and the map teaser.
- `lib/mentorship.ts`, `useChapterMembers`/`useMapMembers` in `lib/queries.ts`.
- `components/` — added `ScreenHeader`, `SearchBar`, `Chip`, `SegmentedControl`.

> **Map needs a custom dev client** (it can't render in Expo Go) plus a Mapbox public
> token in `.env`. For native builds, `@rnmapbox/maps` also needs a Mapbox *download*
> token in the `app.json` plugin (`RNMapboxMapsDownloadToken`).
>
> **Messaging is mentorship-scoped:** the `messages` table is tied to an accepted
> `mentorship_requests` row (per DATABASE.md), so the profile action is "Request
> mentorship" rather than a generic DM. Group chat is its own system (Phase 4).

### Phase 4 — group chats ✅ typecheck + bundle verified
- `supabase/migrations/` — `app-v1-chat.sql`, `app-v1-seed-channels.sql`, `app-v1-jobs.sql`
  copied into the repo (not yet executed — see note below).
- `app/(tabs)/chats/` — nested stack: channel **list** (sectioned CHANNELS/EXEC/ALUMNI,
  unread dots, previews) + channel **thread** (grouped bubbles, tap-sender→profile,
  composer). Full detail in `app/(tabs)/chats/README.md`.
- `lib/chat.ts` — `useChannels` + `useChannelThread` with **Supabase Realtime**
  (`room:<channelId>` INSERT subscription, deduped append).
- `lib/reads.ts` (secure-store unread tracking) and `lib/time.ts` (relative/clock time).

> **Migrations not run by me.** The SQL targets the shared **production** database, so I
> placed the files in `supabase/migrations/` but did not execute them. Run them yourself
> in the Supabase SQL Editor (order in the migrations README), and enable Realtime on
> `channel_messages`. The channel list shows a clear empty state until then.

### Phase 5 — job board ✅ typecheck + bundle verified
- `app/(tabs)/people.tsx` — the Jobs toggle now renders the **"Currently Hiring"** board:
  search + industry/city filter chips, a "Post a job" button, newest-first list.
- `app/jobs/new.tsx` — post-a-job form (title/company required, location, industry,
  description, apply link) → inserts into `job_postings`.
- `app/jobs/[id].tsx` — job detail with Apply (opens `apply_url`) and a tappable
  "Posted by" → profile.
- `lib/jobs.ts` (`useJobs`, `useJob`, `createJob`) and `components/JobCard.tsx`.
- Needs `app-v1-jobs.sql` applied (already in `supabase/migrations/`).

### Phase 6 — admin ✅ typecheck + bundle verified
- `app/(tabs)/admin.tsx` — admin hub (owners/managers only) with a live pending-approvals
  count, linking to the three areas below.
- `app/admin/approvals.tsx` — pending-member queue; approve (sets `status='approved'`) or
  reject (deletes the pending profile, with a confirm dialog).
- `app/admin/channels.tsx` — create channels (name + visibility), inline rename, tap-to-cycle
  visibility, delete (with confirm). This is the Phase 4 "admin creates a channel" item.
- `app/admin/settings.tsx` — edit chapter name/designation; share the invite link.
- `lib/admin.ts` — `usePendingMembers`, `useAdminChannels`, `useChapter` + action helpers.

> Admin writes depend on the **live tables' RLS** (profiles/chapters) granting owners/
> managers update/delete in their chapter — these policies live on the website's DB, not
> in this repo. The chat/job policies for new tables are in `supabase/migrations/`.

---

## V1 status

All six build phases are scaffolded and pass typecheck + a full `expo export` bundle. What
remains before a demo is **runtime verification on a device/simulator** against live data:
fill in `.env` (anon key + Mapbox token), run the three migrations, enable Realtime on
`channel_messages`, then `npx expo start`. The map and any native module also need a custom
dev client (not Expo Go).

> Verified by typecheck and a full Metro bundle. Not yet run on a simulator/device —
> that needs the real `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` and a working account.

**Invite-code note:** the shared schema doesn't document an invite-code column on
`chapters`, so `join/[code]` tries an `invite_code` column and falls back to the chapter
`id`. If the live website uses a different column, update `resolveChapter()` in
`app/join/[code].tsx`.

## Running it

Node is installed via nvm (v24.17.0). If `node` isn't on your PATH in a fresh shell:

```bash
export PATH="$HOME/.nvm/versions/node/v24.17.0/bin:$PATH"
```

Then:

```bash
npm install                  # already done — installs dependencies
# Fill in secrets in .env:
#   EXPO_PUBLIC_SUPABASE_ANON_KEY  → Supabase → Settings → API Keys → Legacy → "anon public"
#   EXPO_PUBLIC_MAPBOX_TOKEN       → account.mapbox.com → Access tokens
npx expo start               # scan QR with Expo Go
npx expo start --ios         # iOS simulator
npx expo start --android     # Android emulator
```

> Dependency versions are pinned to Expo SDK 56's `bundledNativeModules`. Use
> `npx expo install --fix` if you bump the SDK.

See `../greek-ties-app-docs/START_HERE.md` for the full build order.
