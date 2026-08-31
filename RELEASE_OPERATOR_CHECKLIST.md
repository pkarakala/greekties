# Greek Ties Release Operator Checklist

Use this as the step-by-step operator checklist for the remaining **non-code**
App Store blockers. It is based on `docs/LAUNCH_RUNBOOK.md`,
`docs/APP_STORE_CHECKLIST.md`, `docs/PUSH_NOTIFICATIONS.md`, and
`supabase/migrations/README.md` as of 2026-08-30.

Do not submit to App Review until every STOP/VERIFY point below passes.

## 0. Local Release Workstation Prep

- [ ] Start from the synced repo.

```bash
cd /Users/pkarakala/Desktop/greekties
git pull origin main
npm ci
npm run typecheck
npm test -- --runInBand
npm run lint
```

- [ ] If this is the Xcode machine, confirm native prerequisites:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -downloadPlatform iOS
```

- [ ] Confirm Node satisfies React Native 0.85 requirements:

```bash
node --version
```

Required: Node `20.19.4+`, `22.13+`, or `24.3+`.

**STOP/VERIFY:** repo is clean, dependencies install, and typecheck/tests/lint
complete. Lint may report existing warnings, but must have `0 errors`.

## 1. Accounts And Access

- [ ] Confirm Supabase dashboard access to project `sdscrvoorrygesrhjeee`.
- [ ] Enroll in Apple Developer Program for the final seller entity.
- [ ] In App Store Connect, accept all pending agreements:
  App Store Connect -> Business -> Agreements.
- [ ] Confirm Expo account access.
- [ ] Confirm Mapbox account access.
- [ ] Create or confirm a monitored support mailbox:
  `support@greekties.app` unless the legal docs are intentionally changed later.

**STOP/VERIFY:** you can access Supabase, App Store Connect, Expo/EAS, Mapbox,
and the support inbox. Do not continue to builds if Apple agreements are pending.

## 2. Supabase Migrations

Project: `sdscrvoorrygesrhjeee`.

Dashboard path for every migration:
Supabase Dashboard -> project `sdscrvoorrygesrhjeee` -> SQL Editor -> New Query
-> paste the full file contents -> Run.

Run these files in this exact order:

- [ ] `supabase/migrations/app-v1-chat.sql`
- [ ] `supabase/migrations/app-v1-jobs.sql`
- [ ] `supabase/migrations/app-v1-seed-channels.sql`
- [ ] `supabase/migrations/app-v2-invites.sql`
- [ ] `supabase/migrations/app-v2-moderation.sql`
- [ ] `supabase/migrations/app-v2-account-deletion.sql`
- [ ] `supabase/migrations/app-v2-avatars-storage.sql`
- [ ] `supabase/migrations/app-v3-chapters.sql`
- [ ] `supabase/migrations/app-v3-events.sql`
- [ ] `supabase/migrations/app-v3-push.sql`
- [ ] `supabase/migrations/app-v4-chat-delete.sql`
- [ ] `supabase/migrations/app-v4-notifications.sql`
- [ ] `supabase/migrations/app-v4-reactions.sql`

If `app-v2-avatars-storage.sql` fails on storage policy ownership:
Supabase Dashboard -> Storage -> `avatars` bucket -> Policies -> recreate the
owner-scoped write policies using the expressions in that migration file.

After running, verify key objects exist in SQL Editor:

```sql
select to_regclass('public.channels') as channels;
select to_regclass('public.channel_messages') as channel_messages;
select to_regclass('public.channel_members') as channel_members;
select to_regclass('public.job_postings') as job_postings;
select to_regclass('public.chapter_invites') as chapter_invites;
select to_regclass('public.content_reports') as content_reports;
select to_regclass('public.user_blocks') as user_blocks;
select to_regclass('public.events') as events;
select to_regclass('public.event_rsvps') as event_rsvps;
select to_regclass('public.device_tokens') as device_tokens;
select to_regclass('public.notifications') as notifications;
select to_regclass('public.message_reactions') as message_reactions;
```

Verify RPCs exist:

```sql
select proname
from pg_proc
where proname in (
  'join_chapter',
  'create_chapter_invite',
  'delete_own_account',
  'create_chapter'
)
order by proname;
```

Verify chat-delete realtime payload support:

```sql
select relreplident
from pg_class
where relname = 'channel_messages';
```

Expected: `f` for FULL.

**STOP/VERIFY:** every migration ran without unresolved errors, all expected
tables/RPCs exist, and `channel_messages.relreplident = 'f'`.

## 3. Supabase Realtime

Dashboard path:
Supabase Dashboard -> Database -> Replication -> `supabase_realtime`
publication.

Add/confirm these tables:

- [ ] `channel_messages`
- [ ] `messages`
- [ ] `mentorship_requests`
- [ ] `message_reactions`

Confirm the publication supports deletes for channel-message deletion:

```sql
select pubinsert, pubupdate, pubdelete
from pg_publication
where pubname = 'supabase_realtime';
```

Expected:

- `pubinsert = true`
- `pubupdate = true`
- `pubdelete = true`

RLS/realtime privacy check:

- [ ] Sign in as an active non-alumni member.
- [ ] Subscribe/open the app around the alumni channel id.
- [ ] Have an alumni member post in the alumni channel.
- [ ] Confirm the active non-alumni account receives no alumni-channel events.

**STOP/VERIFY:** live channel chat, mentorship status updates, reactions, and
message-delete events are enabled, and the alumni channel does not leak through
Realtime.

## 4. Supabase Edge Functions And Webhooks

Log in to Supabase CLI:

```bash
supabase login
```

Deploy account deletion fallback:

```bash
supabase functions deploy delete-account --project-ref sdscrvoorrygesrhjeee
```

Generate a webhook secret and keep the exact value somewhere private:

```bash
openssl rand -hex 32
```

Set the secret, replacing `<WEBHOOK_SECRET>` with the exact generated value:

```bash
supabase secrets set WEBHOOK_SECRET="<WEBHOOK_SECRET>" --project-ref sdscrvoorrygesrhjeee
```

Deploy push fan-out. `--no-verify-jwt` is required because Database Webhooks are
not signed-in users:

```bash
supabase functions deploy send-push --no-verify-jwt --project-ref sdscrvoorrygesrhjeee
```

Create four Database Webhooks:
Supabase Dashboard -> Database -> Webhooks -> Create a new hook.

For each hook:

- Method: `POST`
- URL: `https://sdscrvoorrygesrhjeee.supabase.co/functions/v1/send-push`
- HTTP header: `x-webhook-secret: <WEBHOOK_SECRET>`
- Type: HTTP Request

Create these hooks:

| Name | Table | Events |
|---|---|---|
| `push-channel-messages` | `channel_messages` | INSERT |
| `push-mentorship-new` | `mentorship_requests` | INSERT |
| `push-mentorship-updated` | `mentorship_requests` | UPDATE |
| `push-thread-messages` | `messages` | INSERT |

**STOP/VERIFY:** Supabase Dashboard -> Edge Functions shows both
`delete-account` and `send-push`. `send-push` logs do not show 401s after a
test webhook event; 401 means the `x-webhook-secret` value does not match.

## 5. Mapbox Tokens

Mapbox Dashboard -> Access tokens.

- [ ] Create or copy public runtime token:
  `EXPO_PUBLIC_MAPBOX_TOKEN`, must start with `pk.`.
- [ ] Create secret download token:
  `MAPBOX_DOWNLOAD_TOKEN`, must start with `sk.` and include `DOWNLOADS:READ`.

Do not commit either token.

**STOP/VERIFY:** you have one `pk.*` token for runtime maps and one `sk.*`
token with `DOWNLOADS:READ` for native iOS build dependency download.

## 6. EAS Project And Environment

From repo root:

```bash
cd /Users/pkarakala/Desktop/greekties
eas login
eas init
```

`eas init` should write `extra.eas.projectId` into `app.config.ts`. Commit and
push that generated config change:

```bash
git status --short
git add app.config.ts
git commit -m "chore: add EAS project id"
git push origin main
```

Set EAS environment variables for all build profiles. Required values:

| Name | Visibility | Source |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Plain text | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Plain text | Supabase -> Settings -> API Keys -> anon public |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Plain text | Mapbox `pk.*` token |
| `MAPBOX_DOWNLOAD_TOKEN` | Secret | Mapbox `sk.*` token with `DOWNLOADS:READ` |

Use the EAS dashboard or CLI. CLI form:

```bash
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value "https://sdscrvoorrygesrhjeee.supabase.co" --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<SUPABASE_ANON_KEY>" --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_MAPBOX_TOKEN --value "<MAPBOX_PK_TOKEN>" --environment production --visibility plaintext
eas env:set --name MAPBOX_DOWNLOAD_TOKEN --value "<MAPBOX_SK_DOWNLOAD_TOKEN>" --environment production --visibility secret
```

Repeat for any EAS environments/profiles you will build from, especially
development/preview if used for internal validation.

Create first iOS builds:

```bash
eas build --profile development --platform ios
eas build --profile production --platform ios
```

When EAS prompts for iOS credentials, allow EAS to manage:

- distribution certificate
- provisioning profile
- APNs key / push entitlement

**STOP/VERIFY:** `app.config.ts` contains `extra.eas.projectId`, the change is
pushed to GitHub, EAS env vars exist, and production build completes.

## 7. Local Simulator Smoke Test

On the Xcode machine:

```bash
cd /Users/pkarakala/Desktop/greekties
git pull origin main
npm ci
cp .env.example .env
```

Fill `.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://sdscrvoorrygesrhjeee.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
EXPO_PUBLIC_MAPBOX_TOKEN=<MAPBOX_PK_TOKEN>
MAPBOX_DOWNLOAD_TOKEN=<MAPBOX_SK_DOWNLOAD_TOKEN>
```

Run the app:

```bash
npx expo start --ios
```

Smoke test:

- [ ] Sign up with a fresh email -> confirm -> log in.
- [ ] Forgot/reset password round trip works.
- [ ] Join a chapter by invite code during signup.
- [ ] Join a chapter by invite code while already signed in.
- [ ] Create a chapter as a fresh no-invite user; user lands as owner.
- [ ] Home, People, Chats, Events, and Me render.
- [ ] Send channel message; second simulator/account receives it live.
- [ ] React to a channel message; second account sees reaction update.
- [ ] Delete own channel message; second account sees it disappear.
- [ ] Create event, RSVP, and toggle categories.
- [ ] Edit profile and upload avatar.
- [ ] Alumni map renders in a dev/native build with Mapbox token.
- [ ] Mentorship request -> accept -> thread messages arrive live both ways.
- [ ] Post job, edit/close job, open apply link.
- [ ] Report message and profile.
- [ ] Block user; blocked content disappears.
- [ ] Delete throwaway account; user signs out, rows are gone, re-signup works.
- [ ] Airplane mode / missing env states show friendly errors, not crashes.

**STOP/VERIFY:** no crash or raw Postgres error appears in the simulator flow.
Log every failure before continuing to TestFlight.

## 8. TestFlight Internal Build

Submit production build:

```bash
eas submit --platform ios
```

In App Store Connect:

- [ ] Add the build to TestFlight.
- [ ] Add internal testers.
- [ ] Install the TestFlight build on a real iPhone.

Repeat the simulator smoke test on TestFlight. Push-specific physical-device
checks:

- [ ] Sign in and accept notification permission.
- [ ] Verify token row:

```sql
select user_id, platform, token
from device_tokens
order by updated_at desc;
```

- [ ] Direct Expo push test:

```bash
curl -sS https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{"to":"<EXPO_PUSH_TOKEN>","title":"Greek Ties","body":"Test push","data":{"url":"/"}}'
```

- [ ] End-to-end push: second account sends channel message; phone receives
  banner; tapping opens the correct chat.
- [ ] Deny push on another test account/device if available; verify the Home
  bell and `/notifications` still show the durable notification row.
- [ ] Sign out; verify token unregisters and no further push arrives.

**STOP/VERIFY:** TestFlight build passes the full C1 smoke test, real-device
push works, and `/notifications` records events.

## 9. Demo Chapter And App Review Account

In production Supabase, seed an App Review demo environment.

Required data:

- [ ] Chapter named `App Review Demo Chapter`.
- [ ] Demo account, suggested email `appreview@greekties.app`.
- [ ] Demo account is an approved member of the demo chapter.
- [ ] A few member profiles.
- [ ] At least one alumni member with map coordinates.
- [ ] Active channels with messages.
- [ ] One open mentorship thread.
- [ ] At least one job posting.
- [ ] At least one event.

Do not put private credentials in the repo. Store the demo email/password only
in App Store Connect -> App Review Information.

Reviewer-note draft:

```text
Greek Ties is an invite-based Greek-life chapter networking app. The demo
account below is already joined to App Review Demo Chapter so review can access
all core features without an invite.

Report/block controls are available from message long-press menus and profile
overflow actions. Account deletion is in the Me tab. New users must accept the
Terms and Privacy Policy at signup. Content reports are reviewed within 24
hours through our moderation queue and support process.
```

Verify demo account flow:

- [ ] Browse directory.
- [ ] View alumni map.
- [ ] Send channel message.
- [ ] React to an own/other channel message.
- [ ] Delete own channel message.
- [ ] View/RSVP event.
- [ ] Report a message.
- [ ] Block a user.
- [ ] Post/view job.
- [ ] View notification inbox.
- [ ] Confirm account deletion on a throwaway clone account, not the demo account.

**STOP/VERIFY:** App Review can access every feature with the demo account and
without needing an invite code.

## 10. App Store Connect Metadata

Create app record:

- Bundle ID: `com.greekties.app`
- Name: `Greek Ties`
- Fallback name if unavailable: `Greek Ties - Chapter Network`
- Platform: iOS

Privacy policy and terms:

- Privacy Policy URL:
  `https://github.com/pkarakala/greekties/blob/main/docs/legal/PRIVACY_POLICY.md`
- Terms URL:
  `https://github.com/pkarakala/greekties/blob/main/docs/legal/TERMS.md`
- Support URL: use the live support page or mailbox destination you will monitor.
- Support email: `support@greekties.app` unless changed in legal docs.

Privacy nutrition label:

- Answer: Yes, data is collected.
- Data is linked to identity.
- Data is not used for tracking.
- Do not add App Tracking Transparency prompt.

Declare:

| Apple category | Data | Purpose |
|---|---|---|
| Contact Info -> Name | Full name | App Functionality |
| Contact Info -> Email Address | Account email | App Functionality |
| Location -> Coarse Location | Optional profile city/coordinates | App Functionality |
| User Content -> Photos or Videos | Profile photo/avatar | App Functionality |
| User Content -> Other User Content | Messages, jobs, reports, bio/profile fields | App Functionality |
| Identifiers -> User ID | Supabase auth user ID | App Functionality |

Do not declare unless counsel says otherwise:

- Sensitive Info for fraternity/sorority affiliation.
- Precise Location, because device location is used on-device to center the map
  and is not stored.
- Diagnostics, Usage Data, Purchases, Financial Info, Health, Browsing History,
  or Search History.

Age rating:

- Recommended: `17+`.
- User-Generated Content: `Yes`.
- Unrestricted Web Access: `No`.

Export compliance:

- Standard HTTPS only.
- `ITSAppUsesNonExemptEncryption` is already `false` in `app.config.ts`.

Screenshots:

- [ ] 6.9" iPhone set, from seeded demo chapter.
- [ ] 6.5" iPhone set, from seeded demo chapter.
- [ ] Avoid empty states in screenshots.

**STOP/VERIFY:** App Store Connect metadata is complete, privacy answers match
the codebase, age rating is set, screenshots show seeded data, and support/legal
URLs are reachable in a logged-out browser.

## 11. Final Pre-Submission Gate

- [ ] Supabase migrations through v4 are applied to production.
- [ ] RLS acceptance tests from `supabase/migrations/README.md` passed.
- [ ] Per-file acceptance tests passed for:
  `app-v2-invites.sql`, `app-v2-account-deletion.sql`,
  `app-v3-chapters.sql`, and all v4 migrations.
- [ ] Realtime tables and delete publication support are verified.
- [ ] `delete-account` and `send-push` Edge Functions are deployed.
- [ ] Four Database Webhooks are live with `x-webhook-secret`.
- [ ] EAS production env vars/secrets are set.
- [ ] Production iOS build is on TestFlight.
- [ ] Full smoke test passed on the exact TestFlight build.
- [ ] Physical-device push passed.
- [ ] Notification inbox passed.
- [ ] Demo account works and credentials are in App Review Information.
- [ ] Support inbox is monitored.
- [ ] Privacy policy and terms URLs are reachable.
- [ ] App Store screenshots and metadata are complete.

Final local sanity check before submission:

```bash
cd /Users/pkarakala/Desktop/greekties
git pull origin main
npm ci
npm run typecheck
npm test -- --runInBand
npm run lint
```

**STOP/VERIFY:** every checkbox above is complete. Then submit the TestFlight
build for App Review.

## 12. Day-1 Operations

Moderation queue, daily:

```sql
select *
from content_reports
where status = 'open'
order by created_at;
```

Invite-code rotation if a code leaks:

```sql
update chapter_invites
set revoked = true
where code = '<LEAKED_CODE>';
```

Content takedown:

```sql
update content_reports
set status = 'reviewed'
where id = '<REPORT_ID>';
```

Operational checks:

- [ ] Check `content_reports` at least daily.
- [ ] Acknowledge support inbox messages within 24 hours.
- [ ] Use Supabase Dashboard -> Logs for API/Postgres incidents.
- [ ] Check `https://status.supabase.com` during outages.
- [ ] Treat anon-key rotation as a last resort because it requires EAS env
  update and a new build.
- [ ] Keep `docs/STATUS.md` updated after operational changes.
