# Push Notifications — Setup Runbook

*How to take push from "code exists" to "notifications arrive on a phone."
Work top to bottom; every step is required. See also
`docs/APP_STORE_CHECKLIST.md` (EAS/Apple accounts) and
`supabase/migrations/README.md` (migration run order).*

## How it works (30 seconds)

1. `lib/notifications.ts` — on login, `usePushRegistration()` (mounted in
   `app/_layout.tsx`) asks for permission, gets an Expo push token, and
   upserts it into the `device_tokens` table. On sign-out the app deletes the
   row. Tapping a notification routes to its `data.url` in-app path.
2. `supabase/migrations/app-v3-push.sql` — the `device_tokens` table
   (owner-only RLS).
3. `supabase/functions/send-push/index.ts` — an Edge Function that Database
   Webhooks call on new chat/mentorship activity. It resolves recipients,
   reads their tokens (service-role), and POSTs to Expo's push API
   (`https://exp.host/--/api/v2/push/send`). Bodies are generic — message
   content never leaves the database, only sender names.

Everything degrades gracefully: until the steps below are done, the app
simply logs one skip line and works exactly as before.

## Prerequisites

- **EAS project** — push tokens require an EAS `projectId`. Run `eas login`
  then `eas init` from the repo root (see `docs/APP_STORE_CHECKLIST.md` §2);
  this writes `extra.eas.projectId` into `app.config.ts` — commit that
  change. Without it, registration is skipped with a console log.
- **A physical device** — simulators have no push transport.
- **A development build or TestFlight/store build** — remote push does NOT
  work in Expo Go on SDK 53+. Build one with
  `eas build --profile development --platform ios`.
- **iOS push credentials** — the first `eas build` prompts to let EAS manage
  the APNs key. Say yes (requires the Apple Developer account). Android/FCM
  is configured automatically by EAS for Expo push.
- **Supabase CLI** logged in with access to project `sdscrvoorrygesrhjeee`.

## Step 1 — Run the migration

Supabase Dashboard → SQL Editor → New Query → paste
`supabase/migrations/app-v3-push.sql` → Run. (Idempotent; safe to re-run.
Run the app-v1/app-v2 files first if they haven't been — order in
`supabase/migrations/README.md`.)

Then run the acceptance tests in the file's footer comment.

## Step 2 — Set the webhook secret

The Edge Function is deployed without JWT verification (webhooks aren't
users), so a shared secret header is its only auth. Generate and set one:

```bash
supabase secrets set WEBHOOK_SECRET="$(openssl rand -hex 32)" \
  --project-ref sdscrvoorrygesrhjeee
```

Keep a copy of the value (e.g. `supabase secrets list` shows only a digest) —
you need the exact string again in Step 4.

## Step 3 — Deploy the Edge Function

```bash
supabase functions deploy send-push --no-verify-jwt \
  --project-ref sdscrvoorrygesrhjeee
```

`--no-verify-jwt` is required — without it the platform rejects webhook
calls before our secret check runs. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected automatically; do not set them.

## Step 4 — Create the four Database Webhooks

Supabase Dashboard → Database → Webhooks → **Create a new hook**, four times:

| # | Name (suggested)          | Table                 | Events | Type          |
|---|---------------------------|-----------------------|--------|---------------|
| 1 | `push-channel-messages`   | `channel_messages`    | INSERT | HTTP Request  |
| 2 | `push-mentorship-new`     | `mentorship_requests` | INSERT | HTTP Request  |
| 3 | `push-mentorship-updated` | `mentorship_requests` | UPDATE | HTTP Request  |
| 4 | `push-thread-messages`    | `messages`            | INSERT | HTTP Request  |

For **each** hook, identical settings:

- **Method:** `POST`
- **URL:** `https://sdscrvoorrygesrhjeee.supabase.co/functions/v1/send-push`
- **HTTP Headers:** add `x-webhook-secret` = the exact `WEBHOOK_SECRET` value
  from Step 2. **Without this header every call is rejected with 401.**
- Leave timeout/params at defaults.

(Webhook 3 fires on every `mentorship_requests` UPDATE; the function ignores
everything except the transition into `accepted` — no dashboard-side filter
is needed.)

## Step 5 — Test on a physical device

1. Install the development build on a phone, sign in, accept the notification
   permission prompt.
2. Verify a row appeared: SQL Editor →
   `select user_id, platform, token from device_tokens;`
3. **Direct delivery test** (bypasses the DB — proves device + Expo creds):
   ```bash
   curl -sS https://exp.host/--/api/v2/push/send \
     -H "Content-Type: application/json" \
     -d '{"to":"<token from step 2>","title":"Greek Ties","body":"Test push","data":{"url":"/"}}'
   ```
   The notification should arrive within seconds.
4. **End-to-end test:** from a *second* account (or the SQL editor), send a
   channel message / create a mentorship request. The first device should get
   a push; tapping it must open the right screen (`/chats/<id>` or
   `/inbox/<id>`).
5. Check function logs if nothing arrives: Dashboard → Edge Functions →
   `send-push` → Logs. `401` = header/secret mismatch; `skipped: true` = the
   event mapped to no recipients (e.g. no `channel_members` rows for a public
   channel); `delivered: 0` = recipients have no registered tokens.

## Known limitations / follow-ups

- **Public channels notify explicit members only.** Membership for
  `visibility = 'all'` channels is implicit (no `channel_members` rows), so
  chapter-wide blasts for public channels need either backfilled membership
  rows or a recipient query against `profiles` — deliberately deferred.
- **Sign-out cleanup is best-effort.** If a user deletes the app without
  signing out, their token dies silently; Expo then returns
  `DeviceNotRegistered` on the next send and the function deletes the row.
- **Blocked users still trigger pushes.** Block filtering is client-side
  today; a `user_blocks` check in the function is a cheap follow-up.
