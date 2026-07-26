# Greek Ties — Launch Runbook

*The single ordered end-to-end checklist to take this app from repo to public
App Store release. Work top to bottom; each section assumes the previous one is
done. Companion docs: `docs/SIMULATOR_SETUP.md` (running locally),
`docs/APP_STORE_CHECKLIST.md` (submission detail), `supabase/migrations/README.md`
(schema + RLS acceptance tests).*

*Cross-device reminder: commit + push every step's artifacts — the repo is the
single source of truth across machines.*

---

## A. Backend (Supabase project `sdscrvoorrygesrhjeee`)

Prerequisite: **Supabase dashboard access confirmed.** If the project holds real
users, do a full run on a staging project first (`docs/PRODUCTION_ROADMAP.md`
Phase A).

### A1. Run the migrations, in this exact order

Supabase Dashboard → SQL Editor → New Query → paste file → Run. All files are
idempotent (safe to re-run). Full rationale per file:
`supabase/migrations/README.md`.

1. [ ] `app-v1-chat.sql` — channels, channel_messages, channel_members + RLS
2. [ ] `app-v1-jobs.sql` — job_postings (+ `is_open`) + RLS
3. [ ] `app-v1-seed-channels.sql` — default channels for existing chapters (after #1)
4. [ ] `app-v2-invites.sql` — chapter_invites + `join_chapter` / `create_chapter_invite` RPCs
5. [ ] `app-v2-moderation.sql` — content_reports + user_blocks
6. [ ] `app-v2-account-deletion.sql` — `delete_own_account()` RPC (if it can't
       delete from `auth.users`, the Edge Function in A3 is the fallback — see
       that file's header)
7. [ ] `app-v2-avatars-storage.sql` — public `avatars` bucket + owner-scoped
       write policies (if `create policy` fails with "must be owner", recreate
       the policies via Dashboard → Storage → avatars → Policies; expressions
       are in the file)
8. [ ] `app-v3-chapters.sql` — `create_chapter()` RPC (organic signups found a
       chapter, become owner, default channels seeded)
9. [ ] Events migration (`events` + `event_rsvps` tables + RLS) — run whichever
       `app-v3-*` file in `supabase/migrations/` creates them
10. [ ] Push migration (`device_tokens` table + RLS) — run whichever
        `app-v3-*` file creates it

> The app degrades gracefully when v2/v3 objects are missing (hidden features,
> no raw errors), so partial rollout is safe — but every unapplied file is a
> feature App Review can't see.

### A2. Enable Realtime

Dashboard → Database → Replication → `supabase_realtime` publication → add:

- [ ] `channel_messages` — live channel chat
- [ ] `messages` — live mentorship threads
- [ ] `mentorship_requests` — live status flips (pending → accepted/declined)

Then verify the RLS/Realtime caveat in `supabase/migrations/README.md` →
"Realtime": subscribe as an active (non-alumni) member filtered to the alumni
channel's id and confirm **no** events arrive when an alum posts.

### A3. Deploy Edge Functions

From the repo root, with the Supabase CLI logged in (`supabase login`):

```bash
supabase functions deploy delete-account --project-ref sdscrvoorrygesrhjeee
supabase functions deploy send-push --project-ref sdscrvoorrygesrhjeee
```

- [ ] `delete-account` — account-deletion fallback. No secrets to configure
      (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` are
      platform-injected). Header of
      `supabase/functions/delete-account/index.ts` has the full flow.
- [ ] `send-push` — reads `device_tokens`, calls the Expo Push API. Check its
      `index.ts` header for any required secrets; set them with:
      ```bash
      supabase secrets set NAME=value --project-ref sdscrvoorrygesrhjeee
      ```
- [ ] **Database Webhooks** for push: Dashboard → Database → Webhooks → create
      a webhook per triggering table (e.g. INSERT on `channel_messages`,
      `messages`) → HTTP POST to the `send-push` function URL with the
      `Authorization: Bearer <service_role or anon key>` header the function
      expects (see its header comments).

### A4. RLS acceptance tests (non-negotiable)

- [ ] Walk the full checklist in `supabase/migrations/README.md` → "After
      running — RLS acceptance-test checklist" (alumni privacy, cross-chapter
      isolation, exec lockdown, membership column pin, job pinning, invites).
- [ ] Run the per-file ACCEPTANCE TESTS footers in `app-v2-invites.sql`,
      `app-v2-account-deletion.sql` (staging/throwaway only — destructive),
      and `app-v3-chapters.sql`.

## B. Accounts & external services

- [ ] **Apple Developer Program** ($99/yr) — decide individual vs. organization
      (org needs a D-U-N-S number). Accept all pending agreements in App Store
      Connect → Business (builds can't be submitted with pending agreements).
- [ ] **Expo/EAS**:
      ```bash
      npm install -g eas-cli   # or: npx eas-cli ...
      eas login
      eas init                 # writes extra.eas.projectId into app.config.ts
      git add app.config.ts && git commit -m "chore: EAS projectId"
      ```
      Then set EAS env vars for all build profiles (Project → Environment
      variables, or `eas env:create`):
      - `EXPO_PUBLIC_SUPABASE_URL` (plain)
      - `EXPO_PUBLIC_SUPABASE_ANON_KEY` (plain — public *only* because RLS is
        verified in A4)
      - `EXPO_PUBLIC_MAPBOX_TOKEN` (plain, `pk.*`)
      - `MAPBOX_DOWNLOAD_TOKEN` (**secret**, `sk.*`)
      First builds:
      ```bash
      eas build --profile development --platform ios   # simulator dev client
      eas build --profile production --platform ios    # once credentials exist
      ```
      Let EAS manage iOS credentials (cert + provisioning profile). Because the
      app now ships push (`expo-notifications`), EAS will also provision the
      APNs key / push entitlement — accept that.
- [ ] **Mapbox** — create both tokens at account.mapbox.com → Access tokens:
      `pk.*` public (runtime maps) and `sk.*` with `DOWNLOADS:READ` scope
      (native SDK fetch at build time). Never commit either. Details:
      `docs/APP_STORE_CHECKLIST.md` §4.
- [ ] **Support inbox** — make `support@greekties.app` (or your chosen address)
      a real, monitored mailbox, and update `lib/legal.ts` +
      `docs/legal/*` if the address differs.
- [ ] **Privacy policy hosting** — a live URL is mandatory. GitHub-hosted
      markdown is acceptable for v1:
      `https://github.com/pkarakala/greekties/blob/main/docs/legal/PRIVACY_POLICY.md`
      (and `TERMS.md`). A `greekties.app` page can replace it later.

## C. Verification

### C1. Simulator smoke test (Xcode machine; see `docs/SIMULATOR_SETUP.md`)

```bash
git pull && npm ci && cp .env.example .env   # fill .env, then:
npx expo start --ios
```

- [ ] Sign up (fresh email) → confirm → log in; forgot/reset password round-trip
- [ ] Join a chapter via invite code (mint one as an admin first) — through
      signup *and* while already signed in
- [ ] Create a chapter as a fresh no-invite user → lands as owner, default
      channels exist
- [ ] Every tab renders: Home, People (directory + filters), Chats (send a
      message; open a second simulator/account and see it arrive live), Events
      (create, RSVP, category toggles), Me
- [ ] Profile edit + avatar upload; alumni map renders (dev build with Mapbox
      token — Expo Go skips the map gracefully)
- [ ] Mentorship: request → accept → thread messages arrive live both ways
- [ ] Jobs: post, edit/close, open apply link
- [ ] Report a message + a profile; block a user (their content disappears)
- [ ] Delete account (throwaway account) → signed out, rows gone, re-signup works
- [ ] Airplane-mode / missing-.env states show friendly errors, not crashes

### C2. TestFlight internal

- [ ] `eas build --profile production --platform ios` → `eas submit` (or upload
      via App Store Connect) → distribute to internal testers
- [ ] Re-run the C1 list on the TestFlight build (this is what Review sees)

### C3. Push on a physical device (push does not work in simulators)

- [ ] Install the TestFlight (or dev) build on a real iPhone, sign in, accept
      the permission prompt → confirm a row appears in `device_tokens`
- [ ] Trigger a push (send a channel message from another account) → banner
      arrives; tapping it deep-links to the right screen
- [ ] Sign out → confirm the token is unregistered (no push after sign-out)

## D. Submission

Follow `docs/APP_STORE_CHECKLIST.md` top to bottom — app record, privacy
nutrition labels, age rating (17+ recommended), demo account + reviewer notes,
screenshots, final pre-submission sweep. Do not submit until every A/B/C box
above is checked.

## E. Day-1 operations

- [ ] **Moderation watch** — check `content_reports` at least daily
      (Dashboard → Table Editor, `status = 'open'`); App Review expects action
      on reports within 24h, and the reviewer notes promise it.
      ```sql
      select * from content_reports where status = 'open' order by created_at;
      ```
- [ ] **Support SLA** — monitor the support inbox; acknowledge within 24h.
      Account-deletion failures tell users to contact support, so it must work.
- [ ] **Invite-code rotation** — if a code leaks: Dashboard SQL Editor →
      ```sql
      update chapter_invites set revoked = true where code = '<leaked code>';
      ```
      then have a chapter admin reopen chapter settings in-app (mints a fresh
      code via `create_chapter_invite`).
- [ ] **Content takedown** — for a violating message/job/profile field, delete
      the row via Table Editor (service role bypasses RLS), mark the report:
      ```sql
      update content_reports set status = 'reviewed' where id = '<report id>';
      ```
      For a violating *user*, delete their `profiles` row (locks them out of
      the chapter) and document the decision in the support inbox thread.
- [ ] **Incident basics** — Supabase Dashboard → Logs (API + Postgres) is the
      first stop for "app is down" reports; check https://status.supabase.com;
      the anon key can be rotated under Settings → API if it's ever abused
      (requires an EAS env update + new build, so treat as last resort).
      Keep `docs/STATUS.md` updated after every operational change.
