// @ts-nocheck — Deno Edge Function: type-checked by the Supabase CLI (`deno`),
// not by the app's tsc. URL imports and the Deno global are expected here.
//
// ============================================================================
// Greek Ties — Edge Function: delete-account
// ============================================================================
// Fallback path for in-app account deletion (App Store 5.1.1(v)) when the
// delete_own_account() SQL function can't delete from auth.users (see
// supabase/migrations/app-v2-account-deletion.sql header).
//
// Flow: the app calls this function with the signed-in user's JWT →
// we verify the JWT, delete the user's rows in dependency order using the
// service-role key (bypasses RLS), then admin-delete the auth user.
//
// DEPLOY (from the repo root, with the Supabase CLI logged in):
//   supabase functions deploy delete-account --project-ref sdscrvoorrygesrhjeee
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected
// automatically by the platform — no secrets to configure.
//
// CALL (from the app, degrades gracefully if not deployed):
//   const { error } = await supabase.functions.invoke('delete-account');
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // 1. Verify the caller's JWT — only a signed-in user can delete themselves.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Missing authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: userData, error: userError } = await anon.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return json({ error: 'Invalid or expired session' }, 401);
  }
  const uid = userData.user.id;

  // 2. Service-role client: bypasses RLS for the cleanup + admin delete.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 3. Delete app rows in dependency order (children before parents). Tables
  //    from unapplied migrations return "relation does not exist" — ignored so
  //    deletion works at every stage of the rollout.
  const ignoreMissing = (error: { message: string } | null) => {
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      throw new Error(error.message);
    }
  };

  try {
    // Mentorship threads the user is a party to (whole thread goes with them).
    const { data: requests } = await admin
      .from('mentorship_requests')
      .select('id')
      .or(`from_user_id.eq.${uid},to_user_id.eq.${uid}`);
    const requestIds = (requests ?? []).map((r: { id: string }) => r.id);
    if (requestIds.length > 0) {
      ignoreMissing((await admin.from('messages').delete().in('request_id', requestIds)).error);
    }
    ignoreMissing((await admin.from('messages').delete().eq('sender_id', uid)).error);
    ignoreMissing(
      (await admin.from('mentorship_requests').delete().or(`from_user_id.eq.${uid},to_user_id.eq.${uid}`)).error,
    );
    ignoreMissing((await admin.from('channel_messages').delete().eq('sender_id', uid)).error);
    ignoreMissing((await admin.from('channel_members').delete().eq('user_id', uid)).error);
    ignoreMissing((await admin.from('job_postings').delete().eq('posted_by', uid)).error);
    ignoreMissing((await admin.from('content_reports').delete().eq('reporter_id', uid)).error);
    ignoreMissing(
      (await admin.from('user_blocks').delete().or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`)).error,
    );
    ignoreMissing((await admin.from('profiles').delete().eq('user_id', uid)).error);

    // Avatar file (best-effort — bucket may not exist yet).
    await admin.storage.from('avatars').remove([`${uid}/avatar.jpg`]).catch(() => undefined);

    // 4. Finally, the auth user itself.
    const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
    if (deleteError) throw new Error(deleteError.message);

    return json({ success: true }, 200);
  } catch (err) {
    console.error('delete-account failed for', uid, err);
    return json({ error: 'Account deletion failed. Please contact support.' }, 500);
  }
});
