// @ts-nocheck — Deno entry point; handler.ts is covered by app TypeScript/Jest.
import { createClient } from 'npm:@supabase/supabase-js@2.108.2';
import { handleDeleteAccount } from './handler.ts';

// Keep the gateway JWT check enabled. Independently ask Auth for the caller's
// live identity; decoding claims or accepting a request-body UID is insufficient.
Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
  const avatars = admin.storage.from('avatars');
  return handleDeleteAccount(req, {
    authenticate: async (jwt) => {
      const { data, error } = await auth.auth.getUser(jwt);
      return { data: data.user ? { id: data.user.id } : null, error };
    },
    begin: (uid) => admin.rpc('begin_account_deletion', { target_user_id: uid }),
    list: (prefix, offset, limit) =>
      avatars.list(prefix, { offset, limit, sortBy: { column: 'name', order: 'asc' } }),
    remove: (paths) => avatars.remove(paths),
    finish: (uid) => admin.rpc('finish_account_deletion', { target_user_id: uid }),
  });
});
