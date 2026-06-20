# Supabase Migrations — Greek Ties App

New tables the mobile app needs. These **only ADD** tables — they never alter the existing live tables (`chapters`, `profiles`, `mentorship_requests`, `messages`), so they're safe to run against the production database.

## Run order

Run these in the Supabase SQL Editor in this exact order:

1. **`app-v1-chat.sql`** — creates `channels`, `channel_messages`, `channel_members` + RLS policies.
2. **`app-v1-jobs.sql`** — creates `job_postings` + RLS policies.
3. **`app-v1-seed-channels.sql`** — seeds the 6 default channels for every existing chapter. Run AFTER #1.

## How to run

1. Go to Supabase Dashboard → SQL Editor → New Query.
2. Paste the contents of the file.
3. Click Run.
4. Repeat for the next file.

## Realtime

For live chat, enable Realtime on `channel_messages` (Supabase Dashboard → Database →
Replication → add `channel_messages` to the `supabase_realtime` publication). The app
subscribes to INSERTs filtered by `channel_id`.

## After running — verify RLS

The most important check: confirm alumni-only channels are actually private.

1. Log in (in the app or via Supabase) as an **active member** (role ≠ 'Alumni').
2. Query `select * from channels;` — you should NOT see the `alumni` channel.
3. Log in as an **alumni** — you SHOULD see it.

If an active member can see the alumni channel, the RLS policy didn't apply — re-check `app-v1-chat.sql` ran fully without errors.

## Full schema reference

See `../../greek-ties-app-docs/docs/DATABASE.md` for every column's meaning and the complete data model (existing + new tables).
