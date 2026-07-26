// @ts-nocheck — Deno Edge Function: type-checked by the Supabase CLI (`deno`),
// not by the app's tsc. URL imports and the Deno global are expected here.
//
// ============================================================================
// Greek Ties — Edge Function: send-push
// ============================================================================
// Fans database events out as Expo push notifications. Triggered by Supabase
// Database Webhooks (below), it maps each event to recipient user ids, loads
// their rows from `device_tokens` (service-role key — bypasses RLS), and
// POSTs to Expo's push API. Notification bodies are deliberately generic
// ("sent you a message") — message CONTENT never leaves the database, only
// the sender's display name. data.url carries an in-app path that
// lib/notifications.ts validates (must start with '/') and routes on tap.
//
// Handled events:
//   • INSERT channel_messages          → channel members except the sender
//                                        (public channels use implicit
//                                        membership — only users with a
//                                        channel_members row get a push)
//   • INSERT mentorship_requests       → to_user_id (new request)
//   • UPDATE mentorship_requests       → from_user_id, only on the
//                                        pending→accepted transition
//   • INSERT messages                  → the other party of the parent
//                                        mentorship request
//
// DEPLOY (from the repo root, with the Supabase CLI logged in):
//   1. Set the shared webhook secret (any long random string):
//        supabase secrets set WEBHOOK_SECRET="$(openssl rand -hex 32)" \
//          --project-ref sdscrvoorrygesrhjeee
//      (Keep a copy — the same value goes into each webhook's header below.)
//   2. Deploy. --no-verify-jwt is REQUIRED: webhooks come from the database,
//      not a signed-in user, so there is no user JWT to verify. The
//      WEBHOOK_SECRET check below is the auth for this function.
//        supabase functions deploy send-push --no-verify-jwt \
//          --project-ref sdscrvoorrygesrhjeee
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically by
//   the platform — only WEBHOOK_SECRET needs configuring.
//
// WEBHOOK WIRING (Supabase Dashboard → Database → Webhooks → Create):
//   Create FOUR webhooks, all pointing at this function's URL
//   (https://sdscrvoorrygesrhjeee.supabase.co/functions/v1/send-push),
//   method POST, and each with an HTTP header:
//     x-webhook-secret: <the WEBHOOK_SECRET value from step 1>
//   1. table channel_messages,     events: INSERT
//   2. table mentorship_requests,  events: INSERT
//   3. table mentorship_requests,  events: UPDATE
//   4. table messages,             events: INSERT
//   Full click-by-click runbook: docs/PUSH_NOTIFICATIONS.md.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo's documented max messages per push API request. */
const PUSH_CHUNK_SIZE = 100;

// ── Webhook payload shape (Supabase Database Webhooks) ──────────────────────
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { url: string };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Display name for a sender, for "<Name> sent you a message" bodies. */
async function senderName(admin, userId: string): Promise<string> {
  const { data } = await admin
    .from('profiles')
    .select('name')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.name as string | null) ?? 'A member';
}

/**
 * Map a webhook event to recipients + notification copy. Returns null for
 * events that shouldn't notify (e.g. an unrelated mentorship_requests UPDATE).
 */
async function buildNotification(
  admin,
  payload: WebhookPayload,
): Promise<{ userIds: string[]; title: string; body: string; url: string } | null> {
  const record = payload.record ?? {};

  // 1. New channel message → every explicit member of the channel but the sender.
  if (payload.table === 'channel_messages' && payload.type === 'INSERT') {
    const channelId = record.channel_id as string;
    const sender = record.sender_id as string;
    const { data: members } = await admin
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', channelId);
    const userIds = (members ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== sender);
    if (userIds.length === 0) return null;
    return {
      userIds,
      title: 'New message',
      body: `${await senderName(admin, sender)} posted in your chapter chat`,
      url: `/chats/${channelId}`,
    };
  }

  // 2. New mentorship request → the requested mentor.
  if (payload.table === 'mentorship_requests' && payload.type === 'INSERT') {
    return {
      userIds: [record.to_user_id as string],
      title: 'New mentorship request',
      body: `${await senderName(admin, record.from_user_id as string)} sent you a mentorship request`,
      url: `/inbox/${record.id}`,
    };
  }

  // 3. Request accepted → the requester. Only the transition into 'accepted'
  //    notifies; any other UPDATE (decline, edits) is ignored.
  if (payload.table === 'mentorship_requests' && payload.type === 'UPDATE') {
    const wasAccepted = payload.old_record?.status === 'accepted';
    if (record.status !== 'accepted' || wasAccepted) return null;
    return {
      userIds: [record.from_user_id as string],
      title: 'Request accepted',
      body: `${await senderName(admin, record.to_user_id as string)} accepted your mentorship request`,
      url: `/inbox/${record.id}`,
    };
  }

  // 4. New mentorship thread message → the other party of the parent request.
  if (payload.table === 'messages' && payload.type === 'INSERT') {
    const requestId = record.request_id as string;
    const sender = record.sender_id as string;
    const { data: request } = await admin
      .from('mentorship_requests')
      .select('from_user_id, to_user_id')
      .eq('id', requestId)
      .maybeSingle();
    if (!request) return null;
    const recipient =
      request.from_user_id === sender ? request.to_user_id : request.from_user_id;
    if (!recipient || recipient === sender) return null;
    return {
      userIds: [recipient],
      title: 'New message',
      body: `${await senderName(admin, sender)} sent you a message`,
      url: `/inbox/${requestId}`,
    };
  }

  return null;
}

/**
 * POST messages to Expo in chunks of 100 and delete tokens Expo reports as
 * DeviceNotRegistered (uninstalled app, revoked permission) so we stop
 * pushing to dead devices.
 */
async function deliver(admin, messages: PushMessage[]): Promise<void> {
  for (let i = 0; i < messages.length; i += PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + PUSH_CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        console.error('send-push: Expo API returned', res.status, await res.text());
        continue;
      }

      // Tickets come back in the same order as the messages sent.
      const { data: tickets } = await res.json();
      const deadTokens: string[] = [];
      for (let t = 0; t < (tickets ?? []).length; t++) {
        const ticket = tickets[t];
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(chunk[t].to);
        }
      }
      if (deadTokens.length > 0) {
        await admin.from('device_tokens').delete().in('token', deadTokens);
        console.log('send-push: reaped', deadTokens.length, 'dead token(s)');
      }
    } catch (err) {
      // One failed chunk shouldn't kill the rest of the fan-out.
      console.error('send-push: chunk delivery failed:', err);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Shared-secret gate: this function is deployed with --no-verify-jwt, so
  // this header check is its ONLY auth. Reject before reading the body.
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret) {
    console.error('send-push: WEBHOOK_SECRET is not set — rejecting all requests');
    return json({ error: 'Not configured' }, 500);
  }
  if (req.headers.get('x-webhook-secret') !== secret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const notification = await buildNotification(admin, payload);
    if (!notification) {
      return json({ skipped: true }, 200);
    }

    const { data: tokens } = await admin
      .from('device_tokens')
      .select('token')
      .in('user_id', notification.userIds);

    const messages: PushMessage[] = (tokens ?? []).map((row) => ({
      to: row.token as string,
      title: notification.title,
      body: notification.body,
      sound: 'default',
      data: { url: notification.url },
    }));
    if (messages.length === 0) {
      return json({ delivered: 0 }, 200);
    }

    await deliver(admin, messages);
    return json({ delivered: messages.length }, 200);
  } catch (err) {
    console.error('send-push failed:', err);
    // 200 so Supabase doesn't retry-hammer a permanently failing event —
    // push is best-effort; the message itself is safe in the database.
    return json({ error: 'Delivery failed' }, 200);
  }
});
