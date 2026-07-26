# App Store Submission Checklist

*Everything that still has to happen — outside this repo — to get Greek Ties
onto TestFlight and the App Store. This is Section D of
`docs/LAUNCH_RUNBOOK.md`; do the runbook's backend/accounts/verification
sections first. Work top to bottom.*

## Status at a glance (updated 2026-07-25)

**Satisfied by the codebase** (verify on-device, but no code work left):

- ✅ Account deletion in-app (Me tab → `delete_own_account()` RPC with
  `supabase/functions/delete-account` Edge Function fallback) — guideline 5.1.1(v)
- ✅ UGC moderation: report content + block users (`lib/moderation.ts`, wired
  into profiles/messages/jobs), terms acceptance at signup — guideline 1.2
- ✅ App icon / adaptive icon / splash (`assets/`, cream/gold/navy brand)
- ✅ Legal drafts (`docs/legal/PRIVACY_POLICY.md`, `docs/legal/TERMS.md`),
  linked in-app at signup and in Me
- ✅ `eas.json` (remote versioning + autoIncrement), `app.config.ts` with
  infoPlist usage strings and env-driven secrets
- ✅ Push notifications code (`lib/notifications.ts` via expo-notifications) and
  events/calendar — pending their migrations + Edge Function deploy (runbook §A)

**Still open — human/account tasks** (nothing in-repo can close these):

- ⬜ Apple Developer Program membership + pending agreements accepted (§1)
- ⬜ `eas init` → `extra.eas.projectId` committed into `app.config.ts` (§2)
- ⬜ EAS env vars/secrets set; Mapbox `pk.*`/`sk.*` tokens created (§2, §4)
- ⬜ Privacy nutrition labels questionnaire (§3)
- ⬜ Age rating questionnaire (§3)
- ⬜ Live support mailbox + privacy-policy URL confirmed reachable (§3)
- ⬜ Demo chapter + demo account seeded, reviewer notes written (§6)
- ⬜ Screenshots from the seeded demo chapter (§3)

---

## 1. Accounts and access

- [ ] **Apple Developer Program** membership ($99/yr) for the entity that will
      own the app. Decide individual vs. organization (organization requires a
      D-U-N-S number and shows a company name as the seller).
- [ ] **Expo account** with access to EAS Build (free tier is fine to start).
- [ ] **Mapbox account** — two tokens are needed (see Section 4).
- [ ] Confirm **Supabase dashboard access** (per `docs/PRODUCTION_ROADMAP.md`,
      this gates everything; the SQL in `supabase/migrations/` must be applied
      before a build is reviewable).

## 2. EAS project init

- [ ] Run `eas login`, then `eas init` from the repo root. This creates the EAS
      project and writes `extra.eas.projectId` into `app.config.ts` — commit
      that change.
- [ ] Set EAS **environment variables** (Project → Environment variables, or
      `eas env:create`) for all build profiles:
      - `EXPO_PUBLIC_SUPABASE_URL` — plain text (public).
      - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — plain text (public; safe *only* once
        RLS is verified).
      - `EXPO_PUBLIC_MAPBOX_TOKEN` — the `pk.*` public token (runtime maps).
      - `MAPBOX_DOWNLOAD_TOKEN` — the `sk.*` token as a **secret** (read by
        `app.config.ts` at build time for the native Mapbox SDK download).
- [ ] First build: `eas build --profile development --platform ios` (simulator
      dev client), then `--profile production` once credentials are set up.
- [ ] Let EAS manage iOS credentials (distribution cert + provisioning profile)
      unless there is a reason not to.

## 3. App Store Connect setup

- [ ] Create the app record: bundle ID `com.greekties.app`, name "Greek Ties"
      (check availability; have a fallback like "Greek Ties — Chapter Network").
- [ ] **Privacy policy URL** — must be a live URL. Currently the legal docs live
      at:
      - <https://github.com/pkarakala/greekties/blob/main/docs/legal/PRIVACY_POLICY.md>
      - <https://github.com/pkarakala/greekties/blob/main/docs/legal/TERMS.md>
      GitHub-hosted markdown is acceptable to App Review; a proper
      `greekties.app` page is a nice-to-have later.
- [ ] Support URL + support email (`support@greekties.app` — **placeholder**;
      the mailbox must actually exist and be monitored before submission).
- [ ] Screenshots: 6.9" (iPhone 16 Pro Max class) and 6.5" sets. Take them from
      the simulator with the seeded demo chapter (Section 6) so screens are not
      empty.

### Privacy nutrition label (App Privacy questionnaire)

Answer "Yes, we collect data." Map each item as follows. Everything is
**collected and linked to identity** (data is tied to the user's account) and
**not used for tracking** (no ads, no analytics/tracking SDKs, no data sharing
with data brokers — answer "No" to the ATT/tracking question and do NOT add the
ATT prompt).

| Apple category | Data | Purpose to select |
|---|---|---|
| Contact Info → Name | Full name | App Functionality |
| Contact Info → Email Address | Account email | App Functionality |
| Location → Coarse Location | Optional profile city/coordinates (alumni map) | App Functionality |
| User Content → Photos or Videos | Profile photo (avatar) | App Functionality |
| User Content → Other User Content | Messages, job postings, reports, bio/profile fields | App Functionality |
| Identifiers → User ID | Supabase auth user ID | App Functionality |
| Sensitive Info | **Not collected** — do not declare fraternity/sorority affiliation as Sensitive Info unless counsel advises otherwise; if asked, chapter membership is user-provided profile data (Other User Content) | — |

Not collected: Health, Financial, Browsing/Search History, Purchases,
Diagnostics (no crash/analytics SDK), Usage Data, Precise Location (device
location is used on-device to center the map and never stored — that does not
count as "collected" under Apple's definition, since it never leaves the
device).

### Age rating

- **Recommended: 17+** until moderation has an operating track record. The app
  hosts unfiltered peer-to-peer chat in a Greek-life context; App Review applies
  extra scrutiny (hazing/harassment history in this category), and 17+ removes
  the argument that minors are exposed to unmoderated UGC.
- Alternative: **12+** is defensible only with the full UGC pack demonstrably
  working (report + 24h review, block, terms acceptance gate, content filtering)
  and reviewer notes explaining the moderation pipeline. Not recommended for the
  first submission.
- In the rating questionnaire, answer "Yes" to *Unrestricted Web Access*? → No
  (no browser); *User-Generated Content* → Yes.

## 4. Mapbox tokens

Two distinct tokens (never commit either):

- [ ] **Public token (`pk.*`)** — runtime map rendering. Goes in
      `EXPO_PUBLIC_MAPBOX_TOKEN` (EAS env var + `.env` locally + the GitHub
      Pages workflow variable, already wired).
- [ ] **Download token (`sk.*`)** with the `DOWNLOADS:READ` scope — lets
      CocoaPods/Gradle fetch the native Mapbox SDK at build time. Goes in
      `MAPBOX_DOWNLOAD_TOKEN` as an **EAS secret**; `app.config.ts` injects it
      into the `@rnmapbox/maps` plugin. Without it, iOS `pod install` fails.

## 5. Push notifications — now enabled (Phase E landed)

The app ships push code (`lib/notifications.ts` via expo-notifications +
`device_tokens` table + `send-push` Edge Function), so the entitlement is now
required and exercised:

- [ ] Let EAS configure push credentials during the first production build
      (APNs key + aps-environment entitlement) — accept when prompted, or run
      `eas credentials` to set it up explicitly.
- [ ] Backend side must be live before submission: `device_tokens` migration
      applied, `send-push` deployed, Database Webhooks created — see
      `docs/LAUNCH_RUNBOOK.md` §A.
- [ ] Verify on a **physical device** (runbook §C3) — simulators cannot
      receive push; App Review tests on real hardware.

## 6. Demo account + reviewer notes (required — UGC app behind a login)

App Review must be able to reach every feature without an invite:

- [ ] Seed a **demo chapter** in the production Supabase project ("App Review
      Demo Chapter") with a few member profiles, an alumni member with map
      coordinates, active channels with messages, one open mentorship thread,
      and at least one job posting.
- [ ] Create a **demo account** (e.g., `appreview@greekties.app`) that is an
      approved member of the demo chapter, and put its email + password in the
      App Review Information section.
- [ ] Reviewer notes should state: the app is invite-based Greek-life chapter
      networking; the demo account is pre-joined to a demo chapter; where to
      find report/block (long-press or overflow on messages/profiles), account
      deletion (Me tab), and the terms-acceptance gate; and that content
      moderation reviews reports within 24 hours.
- [ ] Verify the demo account can complete: browse directory → view alumni map
      → send a channel message → view/RSVP an event → report a message → block
      a user → post/view a job → delete account (test on a *throwaway* clone
      account, not the demo account itself).

## 7. Universal links (TODO — invite virality, post-V1)

Invite links currently only work via the `greekties://` custom scheme, which
does nothing if the app isn't installed:

- [ ] Acquire/confirm the `greekties.app` domain.
- [ ] Add `associatedDomains: ['applinks:greekties.app']` to `ios` in
      `app.config.ts` and serve `/.well-known/apple-app-site-association` from
      the domain.
- [ ] Web landing page for `/join/<code>` that deep-links into the app or
      falls back to App Store + instructions (the growth loop for people
      without the app).
- Not a submission blocker — invite links can be shared as codes for V1.

## 8. Final pre-submission sweep

- [ ] `supabase/migrations/` applied to prod (invites, moderation, deletion RPC,
      avatars bucket, chapter creation, events, device tokens — run order in
      `docs/LAUNCH_RUNBOOK.md` §A1) — the compliance features must actually
      work in the build App Review sees.
- [ ] Run through the demo-account flow (Section 6) on the exact build being
      submitted, on TestFlight.
- [ ] Legal placeholders resolved: governing-law sections in
      `docs/legal/TERMS.md` / `PRIVACY_POLICY.md` reviewed by counsel;
      `support@greekties.app` mailbox live.
- [ ] Version/build handled by EAS (`appVersionSource: remote` +
      `autoIncrement` in `eas.json`) — do not hand-edit build numbers.
