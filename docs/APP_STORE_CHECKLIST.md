# App Store Submission Checklist

*Reconciled 2026-09-17. Future submission checklist, not permission for builds,
uploads, live data, environment changes, or distribution. Follow the current
[launch runbook](LAUNCH_RUNBOOK.md) and [Slice 6 readiness](SLICE_6_READINESS.md).*

## Current readiness

**NO-GO.** Slices 1–5 passed local source/component review; the latest review
records 34 suites / 564 tests, typecheck/diff pass and lint 0 errors / 24 warnings.
V9–V11 are unapplied drafts. Four SQL suites, concurrency, rendered UI, installed
native picker and exact-build browser/device verification remain open. TestFlight
build 11 and V6–V8 live are owner-reported history, not independently checked here.

Apply missing V9 → V10 → V11 in order only after local acceptance and separate
authorization, before dependent-client distribution. V10 clears legacy pins,
defaults consent off, retains city, and rejects entire old-client saves that
include coordinates. V11 backfills/reserves message IDs under write-blocking
locks; default UUID clients remain supported. Do not replay earlier grants,
restore legacy coordinates, or prune retry identities. Details and prerequisites
are in the readiness report. No native binary is verified to include picker 9.1.0.

The pricing, privacy/rating answers, screenshot sizes, and submission copy below
are retained planning drafts. The owner must verify current platform requirements
and actual deployed behavior before submission; they were not verified in Slice 6.

## Historical code inventory (2026-08-30; runtime acceptance still required)

**Implemented in source at that time** (not a completed compliance/device gate):

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
- ✅ In-app notification center, channel-message delete, and emoji reactions —
  pending v4 migrations + Realtime/publication verification (runbook §A)

**Still open — human/account tasks** (nothing in-repo can close these):

- ⬜ Apple Developer Program membership + pending agreements accepted (§1)
- ⬜ Verify the existing `extra.eas.projectId` in `app.config.ts` against the
  intended account; do not initialize again based on this checklist (§2)
- ⬜ EAS env vars/secrets set; Mapbox `pk.*`/`sk.*` tokens created (§2, §4)
- ⬜ Privacy nutrition labels questionnaire (§3)
- ⬜ Age rating questionnaire (§3)
- ⬜ Live support mailbox + privacy-policy URL confirmed reachable (§3)
- ⬜ Supabase migration inventory verified, V9 → V10 → V11 applied after
  separate authorization/local QA, Realtime configured, and Edge
  Functions/webhooks deployed (§5 + runbook §A)
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

## 2. Existing EAS project and candidate compatibility

- [ ] `app.config.ts` already has an EAS project ID. Separately authorized
      operator verifies account/project access and existing configuration;
      do not rerun `eas init` or replace the project as a setup shortcut.
- [ ] Verify the candidate binary contains `@react-native-community/datetimepicker`
      9.1.0. Installed packages/JavaScript updates and historical build 11 do
      not establish native-module compatibility. Execute partial date/time,
      optional-end clear, DST/timezone and actual accessibility/device checks.
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
- [ ] Backend side must be independently verified before submission: reviewed
      migration sequence through V11, V8-compatible `send-push` deployed with
      `WEBHOOK_SECRET`, Database Webhooks created — see
      `docs/LAUNCH_RUNBOOK.md` §A.
- [ ] Verify on a **physical device** (runbook §C3) — simulators cannot
      receive push; App Review tests on real hardware.

## 6. Demo account + reviewer notes (required — UGC app behind a login)

App Review must be able to reach every feature without an invite:

- [ ] After separate live-data authorization, prepare a **demo chapter**
      ("App Review Demo Chapter") with synthetic profiles, a verified alumni
      designation, active channels/messages, an accepted mentorship thread,
      and a real demonstration job/event. Exercise explicit map opt-in and Save
      using the updated client; do not seed coordinates or infer consent.
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
      a user → react to/delete an own channel message → post/view a job → view
      the notification inbox → delete account (test on a *throwaway* clone
      account, not the demo account itself).

## 7. Installation, invitation, and Universal Links

Current source generates HTTPS chapter links under the `WEB_BASE_URL` in
`lib/links.ts` and accepts the `greekties://join/<code>` scheme and raw codes.
Deployed HTTPS routing and OS handoff are unverified here. `app.config.ts` has
no iOS associated domains. Do not claim automatic Universal Link opening or
transfer of browser invitation state through installation.

- [ ] Test the separate TestFlight install link and chapter invitation on the
      exact candidate, then reopen the original invite or paste its code after
      installing. Cover email confirmation, pending approval, and alumni
      designation using the [steward runbook](STEWARD_DISTRIBUTION_RUNBOOK.md).

Any future Universal Links implementation is separately scoped:

- [ ] Acquire/confirm the `greekties.app` domain.
- [ ] Add `associatedDomains: ['applinks:greekties.app']` to `ios` in
      `app.config.ts` and serve `/.well-known/apple-app-site-association` from
      the domain.
- [ ] Web landing page for `/join/<code>` that deep-links into the app or
      falls back to App Store + instructions (the growth loop for people
      without the app).
- The manual paste-code path can support the pilot once verified on the candidate;
  install/join recovery remains a release gate regardless of future Universal Links work.

## 8. Final pre-submission sweep

- [ ] All four SQL suites plus concurrent checks pass on a confirmed disposable
      local database with authoritative schema. Save distinct results for each.
- [ ] Separately authorized operator verifies remote migration inventory and
      V9 → V10 → V11 before candidate-client distribution. Preserve V10 consent
      and V11 retry identities; run order/compatibility: launch runbook §A1.
- [ ] Rendered browser/device journeys, native picker, small screens, enlarged
      text, keyboard/focus, VoiceOver and all state/recovery checks pass on the
      exact candidate. Local Jest success is not evidence for this checkbox.
- [ ] Run through the demo-account flow (Section 6) on the exact build being
      submitted, on TestFlight.
- [ ] Legal placeholders resolved: governing-law sections in
      `docs/legal/TERMS.md` / `PRIVACY_POLICY.md` reviewed by counsel;
      `support@greekties.app` mailbox live.
- [ ] Version/build handled by EAS (`appVersionSource: remote` +
      `autoIncrement` in `eas.json`) — do not hand-edit build numbers.
