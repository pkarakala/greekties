# Running Greek Ties in the iOS Simulator

*For the Xcode machine. Development happens on a separate laptop; always `git pull`
first — the repo is the single source of truth.*

## Prerequisites (one-time)

1. **Xcode** (full app, not just Command Line Tools). Expo SDK 56 / RN 0.85 targets
   the current iOS SDK — install the latest Xcode from the App Store, then:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   xcodebuild -downloadPlatform iOS        # simulator runtime
   ```
2. **Node 20.19.4+ / 22.13+ / 24.3+** (RN 0.85 engines requirement; nvm recommended).
3. **CocoaPods + watchman** — `brew install cocoapods watchman`
   (system Ruby is too old for `gem install cocoapods`; use brew).

## Per-checkout setup

```bash
git clone https://github.com/pkarakala/greekties.git && cd greekties
npm ci
cp .env.example .env
```

Fill `.env` (never commit it):

| Var | Where to get it | Required? |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | prefilled in .env.example | yes |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API Keys → "anon public" | **yes — app crashes at startup without it** (`lib/supabase.ts` asserts it at module load) |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | account.mapbox.com → Access tokens (pk.*) | no — map screen falls back gracefully |

## Two ways to run

### 1. Expo Go (fastest, no native build) — everything EXCEPT the map
```bash
npx expo start --ios
```
⚠️ Known issue: `app/map.tsx` top-level-imports `@rnmapbox/maps`, which may throw in
Expo Go the moment the map route loads (the in-file guard runs too late). Avoid the
map screen in Expo Go until the import is made lazy (tracked in
`docs/PRODUCTION_ROADMAP.md`, Phase D).

### 2. Native build (`expo run:ios`) — needed for the map
Requires a **Mapbox secret download token** (sk.* with `DOWNLOADS:READ` scope) in the
`@rnmapbox/maps` plugin config — currently an empty string in `app.json`, so
`pod install` **will fail** fetching the Mapbox SDK until it's set. Don't commit the
secret; the plan is to convert `app.json` → `app.config.js` reading it from env
(Phase C of the roadmap). Then:
```bash
npx expo run:ios
```

## Backend state (as of 2026-07-24)

- The Supabase project is live but the three SQL files in `supabase/migrations/`
  have **NOT been run** — Chats and Jobs show empty states until they are.
- **Do NOT run the migrations as-is**: `app-v1-chat.sql` has a known RLS hole
  (any member can self-add to exec-only channels) — fix per the roadmap first.
- After running migrations, enable Realtime on `channel_messages`
  (Database → Replication).

## Smoke-test checklist (first device run ever — nothing has been runtime-verified)

- [ ] App boots to login (no white screen)
- [ ] Sign up → email confirm → log in
- [ ] Home renders (empty state if no chapter)
- [ ] Each tab: Home / Chats / People / Me (+ Admin if owner)
- [ ] Profile detail, mentorship request compose
- [ ] Jobs list + post form
- [ ] Note every crash/oddity in a GitHub issue — findings feed the roadmap
