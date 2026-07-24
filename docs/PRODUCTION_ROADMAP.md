# Greek Ties — Production Roadmap

*Written 2026-07-24 after a full-repo audit (product, data layer, screens, SQL/RLS,
build config, security, App Store readiness, UX completeness). This is the working
plan for taking V1 from "compiles" to a startup-grade, App-Store-submittable app.*

---

## What the product is

**"LinkedIn for Greek life."** A private, chapter-scoped professional network for
fraternity/sorority members and alumni, on a shared Supabase backend (also used by a
companion website). Three user tiers:

- **Actives** — join via invite link, browse the member directory, request mentorship, chat.
- **Alumni** — appear on a Mapbox alumni map, get an alumni-only channel, supply mentorship and jobs.
- **Chapter admins** (owners/managers) — approve members, manage channels, edit chapter settings.

Core value props: **Network Net Worth** (gamified network stats hero), **mentorship
matchmaking** (request → accept → scoped messaging), a **GroupMe replacement**
(realtime channels with DB-enforced privacy: exec-only, alumni-only), a **job board**
("Currently Hiring"), and the **alumni map**. Growth is invite-link driven — each
chapter onboards as a pre-formed community. Monetization is only hinted at
(fundraising + merch surfaces, post-V1).

**Design direction:** the app should match the Greek Ties website palette —
**cream / gold / navy** — replacing the current near-black dark theme. All colors are
centralized in `theme/colors.ts`, so this is a single-file retheme plus a
contrast/status-bar audit.

## Ground truth (verified 2026-07-24)

- `npm install` + `tsc --noEmit` pass clean on Node 20. The app has **never run on a
  device or simulator** — all V1 "verified" claims are typecheck + Metro bundle only.
- The Supabase project (`sdscrvoorrygesrhjeee.supabase.co`) is **live** (auth health
  endpoint responds), but no anon key exists on any machine we control yet. Dashboard
  access must be confirmed before anything else.
- The companion **website repo and `greek-ties-app-docs` repo are missing** — not on
  this machine and not on the pkarakala GitHub account. The schema + RLS for the core
  tables (`profiles`, `chapters`, `mentorship_requests`, `messages`) live *only* in
  that unversioned production DB. Until we dump them, the security posture is unknowable.
- The three SQL files in `supabase/migrations/` were **never executed**.
- GitHub Pages is currently **not live** (404), so the deploy workflow hasn't shipped
  the anon key anywhere — good, because RLS isn't verified yet.

## The showstoppers (found in audit, verified in code)

### Broken product loops
1. **The join flow is dead code.** `app/_layout.tsx` bounces any *signed-in* user off
   `/join/*` (it's in `PUBLIC_SEGMENTS`, and signed-in users on public segments get
   redirected home), while `join/[code].tsx` sends *signed-out* users to signup. After
   email-confirmation signup the code is lost entirely ("check your email, then log
   in" — the login screen never forwards the code back to join). Net: **no user in any
   state can complete the app's only growth mechanism.**
2. **Read-only social network.** There is no profile editing (Me tab = name/email/sign
   out) and no avatar upload — yet the directory filters, mentor matching, hiring
   badges, and map all depend on profile fields no app user can ever set.
3. **No forgot-password.** A forgotten password is permanent lockout.
4. **No-invite signup dead-ends.** Organic signups land on an empty Home with zero
   actions available. No code entry, no chapter browse, no create-a-chapter.
5. **Second-chapter join corrupts accounts.** `join/[code].tsx` unconditionally
   inserts a new `profiles` row; `auth.tsx` uses `.maybeSingle()` which errors on
   multiple rows → profile becomes null → whole app treats the user as chapterless.

### Security (fix BEFORE running migrations or filling .env into any public build)
1. **`channel_members` RLS hole** (`app-v1-chat.sql:126`): the `FOR ALL ... USING
   (user_id = auth.uid())` policy doubles as the INSERT check, so **any member can
   self-add to exec-only/private channels**.
2. **Invite "code" is the raw chapter UUID** and the client inserts
   `status: 'approved'` directly — instant approval bypass, no expiry/rotation, and
   the client chooses `chapter_id`. Needs server-side codes (short, rotatable) and a
   SECURITY DEFINER RPC (or column-restricted RLS) so clients can never set
   `status`/`admin_role`/`chapter_id` arbitrarily.
3. **Admin authz is client-side only** (hidden tab via `href: null`). Server
   enforcement depends on unverified production RLS.
4. **PII over-fetch:** `select('*')` on `profiles` ships every member's email and
   exact home lat/lng to every client. Use column lists / a safe view.
5. **`Linking.openURL` on user-supplied URLs** (LinkedIn, job apply links) with no
   scheme allowlist — restrict to `https:`.
6. **`job_postings` UPDATE policy lacks `WITH CHECK`** on chapter_id.

### App Store hard blockers (guaranteed rejections)
- No in-app **account deletion** (guideline 5.1.1(v)).
- No **UGC moderation** — report content, block users, terms acceptance (guideline 1.2).
  Extra scrutiny likely for a Greek-life app (hazing/harassment).
- No **app icon**, no splash image, no **privacy policy** URL or in-app link.
- No `eas.json`, no EAS project, empty `RNMapboxMapsDownloadToken` (native build
  can't even `pod install` Mapbox), no `ios.infoPlist` (location usage string needed
  because Mapbox links CoreLocation), no demo account for App Review.

### Reliability debt (breaks with real usage)
- Chat loads **all messages** unpaginated; channel list does an N+1 last-message query.
- Mentorship threads have **no realtime and no pull-to-refresh** — two people
  "chatting" never see each other's messages until they re-enter the screen.
- Unread state is device-local (SecureStore) — resets on reinstall, can't power push.
- No error boundary; missing `.env` crashes at module load (`lib/supabase.ts` non-null
  assertions). No tests, no CI beyond a web deploy, ESLint not installed.
- `app/map.tsx` does a top-level `import Mapbox from '@rnmapbox/maps'` — in Expo Go
  the import itself can throw before the in-component guard runs. Make it lazy.
- Rejecting a member hard-deletes their profile row (unauditable; they can instantly
  re-join via invite link). Jobs can never be edited, closed, or deleted.

## Open questions (need answers before/while building)

1. **Supabase dashboard access** — do we have login credentials for
   `sdscrvoorrygesrhjeee`? Everything gates on this. Also: does it hold *real* users
   today, or is "production" aspirational? If real, we need a **staging project**.
2. **Where are the website + docs repos?** They own the schema/RLS source of truth.
3. **Membership model decision:** instant-join via invite vs. admin approval queue —
   both coexist half-built. Pick one state machine.
4. **Who creates chapters and the first owner?** No code anywhere inserts into
   `chapters` — the funnel presupposes chapters exist.
5. **Accounts needed:** Apple Developer Program, Expo/EAS, Mapbox (pk.* public + sk.*
   download tokens), privacy-policy hosting, moderation/support contact.
6. **Can one user belong to multiple chapters?** RLS subqueries assume many;
   `auth.tsx` assumes exactly one. Decide cardinality.

## Brainstorm — where this can go (post-hardening)

- **Retention spine: push notifications** (expo-notifications + device_tokens +
  Supabase Edge Function). A chat app without push is functionally dead vs GroupMe.
  This is the single biggest engagement lever after the fixes above.
- **Event calendar** (the big V1 cut): layered chapter/alumni/philanthropy/social/
  recruitment toggles, RSVP, ties into chats via event cards. Likely the #1 daily-use
  driver for actives.
- **Member-facing invite loop:** put "Invite your chapter" on Home (not buried in
  admin settings), universal HTTPS links (associated domains) with a web landing page
  fallback so links work for people without the app.
- **Cold-start playbook:** seed channels on chapter creation, aspirational empty
  states ("Your network is worth more with alumni — invite 5"), a "claim your
  chapter" flow for organic signups.
- **Richer Network Net Worth:** industries/companies/geography breakdown — the
  gamified hook is the app's most differentiated idea; lean into it.
- **Monetization candidates** (in rough order of fit): national-org B2B licensing
  (chapters roll up to nationals — the real buyer), chapter dues/fundraising rails
  (payments = Stripe, take rate), merch storefronts, sponsored job posts from
  employers targeting Greek talent.
- **AI mentor matching** (V2 vision item): match on industry/role/goals once profiles
  are actually editable and populated.

## Phased plan

**Phase A — Ground truth & safety rails (do first)**
1. Confirm Supabase dashboard access; dump live schema + all RLS policies into
   `supabase/` as versioned migrations; run `supabase gen types` → replace
   `lib/types.ts` hand-written interfaces.
2. Create a **staging Supabase project**; never point dev builds at prod.
3. Fix the two known RLS holes in the committed SQL *before* running it anywhere.

**Phase B — Make the core loops work (app becomes usable)**
1. Fix the join flow (auth-gate exemption, code persistence through signup/confirm,
   existing-profile handling, real invite codes server-side).
2. Profile editing + avatar upload (expo-image-picker → Supabase Storage with
   owner-scoped RLS). 3. Forgot password. 4. No-invite escape hatch (manual code
   entry at minimum). 5. Decide + implement the membership state machine.

**Phase C — App Store compliance pack**
Account deletion (Edge Function), report/block + terms acceptance, privacy policy
(hosted + linked), app icon/splash (cream/gold/navy brand), `eas.json` +
`app.config.js` (secrets via env, Mapbox download token as EAS secret),
`ios.infoPlist` usage strings, demo account + reviewer notes.

**Phase D — Reliability + polish**
Cream/gold/navy retheme (`theme/colors.ts`), error boundary + env validation,
mentorship realtime, chat pagination + server-side read state, lazy Mapbox import,
soft-delete rejection, job edit/close, ESLint + Jest + CI (typecheck/lint/test on PR).

**Phase E — Growth (V2)**
Push notifications → event calendar → member invite loop → richer NNW → monetization
experiments.

---

*Cross-device workflow: development happens on a machine without Xcode; simulator
runs happen elsewhere. **Every change must be committed and pushed to
`github.com/pkarakala/greekties` immediately**, and every setup step documented
in-repo. See `docs/SIMULATOR_SETUP.md`.*
