# V2 — Next Steps

What to build after V1 ships and is verified on-device. Ordered roughly by leverage.
V1 = the 9 screens in `../greek-ties-app-docs/docs/SCREENS.md`, Phases 0–6.

---

## 0. Finish V1 verification first (pre-V2 gate)

These are not new features — they're the gap between "compiles" and "shipped". Do them
before starting V2 work.

- [ ] Fill `.env` with the real `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_MAPBOX_TOKEN`.
- [ ] Run the migrations in Supabase (`app-v1-chat.sql` → `app-v1-jobs.sql` → `app-v1-seed-channels.sql`).
- [ ] Enable Realtime on `channel_messages` (Database → Replication).
- [ ] **RLS acceptance test:** active member cannot see the `alumni` channel; an alum can.
- [ ] Confirm the invite-code model — see "Known TODOs" below.
- [ ] Build a custom dev client (the map can't run in Expo Go) and smoke-test every screen on a device.

---

## 1. Event Calendar (the big deferred V1 screen)

The layered calendar was explicitly cut from V1 (`SCREENS.md`). It's the most complex screen.

- Layered toggles: chapter / alumni / philanthropy / social / recruitment.
- New table `events` (chapter-scoped, RLS like the others) + RSVP table.
- Month + agenda views; tie events into Home "recent activity" and a future Chats event card.

## 2. Chat — Phase 2 features

V1 chat is text-only on purpose. Add, in order of value:

- Reactions (emoji) and read receipts (`channel_members.last_read_at` already exists — move
  unread tracking from local secure-store to this server column so it's cross-device).
- Polls and event cards (ties into the calendar).
- File / image sharing (Supabase Storage bucket + RLS).
- Typing indicators and presence (Supabase Realtime presence).
- Message pagination (V1 loads all messages in a channel — page by `created_at`).

## 3. Push notifications

- `expo-notifications` + a `device_tokens` table.
- Triggers: new mentorship request, request accepted, new message in a channel you're in,
  new job posting. Likely a Supabase Edge Function or a webhook from the website.

## 4. Growth / networking features (from the product vision)

- Automated alumni outreach (scheduled nudges to reconnect).
- AI mentor matching (suggest mentors by industry/role/goals).
- Richer "Network Net Worth" (industries breakdown, companies, geographic spread).
- Fundraising and merch surfaces (post-V1 monetization).

---

## Technical hardening (cross-cutting)

- **Testing:** set up Jest + React Native Testing Library. Start with the data hooks
  (`lib/queries`, `lib/chat`, `lib/mentorship`, `lib/jobs`) and the auth gate. Add a typed
  Supabase mock. (None exists yet — V1 was verified via typecheck + bundle only.)
- **EAS / dev client:** add `eas.json`, configure the `@rnmapbox/maps` plugin's
  `RNMapboxMapsDownloadToken` (secret, for native builds), and set up `development` /
  `preview` / `production` profiles.
- **CI:** GitHub Actions running `tsc --noEmit`, lint, and tests on PRs.
- **Lint:** finish ESLint setup (`expo lint` — config not yet installed) + Prettier.
- **Error/empty/loading states:** add a top-level error boundary; standardize the
  loading/empty/error pattern (a shared `<AsyncBoundary>` component).
- **Generated DB types:** generate Supabase TypeScript types (`supabase gen types`) and
  replace the hand-written interfaces in `lib/types.ts` so the client is schema-checked.
- **Pagination:** directory, jobs, and chat all fetch full result sets. Page them for scale.
- **Accessibility:** audit labels/roles/contrast; test with VoiceOver/TalkBack.
- **Analytics & crash reporting:** Sentry + a lightweight product-analytics layer.
- **Offline / caching:** consider TanStack Query or SWR over the bespoke hooks for caching,
  retries, and background refetch.

---

## Known TODOs carried over from the V1 build

- **Invite-code column.** `app/join/[code].tsx` (`resolveChapter`) tries an `invite_code`
  column and falls back to the chapter `id`. Confirm how the live website issues invite
  links and align the lookup + `app/admin/settings.tsx` link generation. Consider a real
  `invite_code` (short, rotatable) instead of exposing the chapter UUID.
- **Home quick actions.** "Find a mentor" and "Browse jobs" both route to `/people` (the
  directory). Pass a param so "Browse jobs" preselects the Jobs toggle.
- **Inbox messaging model.** `messages` is tied to an accepted `mentorship_requests` row, so
  there's no free-form DM. If general DMs are wanted, add a `conversations` table.
- **Unread state.** Chat unread is local (secure-store). Move to `channel_members.last_read_at`
  for cross-device accuracy.
- **Reject member is destructive.** It deletes the pending `profiles` row. Consider a
  `rejected` status instead so it's auditable/reversible.
- **Admin RLS.** Member-approval and chapter-edit writes depend on the live `profiles` /
  `chapters` policies granting owners/managers write access in their chapter. Verify these
  exist on the production DB.
