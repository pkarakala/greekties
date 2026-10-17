// Public build policy only. Never place keys or synthetic-account passwords here.
const productionRef = 'sdscrvoorrygesrhjeee';
function ownerQaTargetError(url, projectRef) {
  if (!projectRef || !/^[a-z]{20}$/.test(projectRef) || projectRef === productionRef)
    return 'Owner QA requires a separately verified synthetic-only hosted backend.';
  if (url !== `https://${projectRef}.supabase.co`)
    return 'Owner QA backend does not match the pinned QA project.';
  return null;
}
function createOwnerQaFetch(url, projectRef, send) {
  return async (input, init) => {
    const invalid = ownerQaTargetError(url, projectRef);
    if (invalid) throw new Error(invalid);
    const target = new URL(typeof input === 'string' ? input : input.url || String(input));
    if (target.origin !== url) throw new Error('Owner QA blocked a non-QA backend request.');
    const path = decodeURIComponent(target.pathname).replace(/\/+/g, '/').replace(/\/+$/, '');
    if (
      path === '/functions/v1/delete-account' ||
      /^\/rest\/v1\/rpc\/(delete_own_account|begin_account_deletion|finish_account_deletion)$/.test(
        path,
      ) ||
      /^\/auth\/v1\/admin\/users(?:\/|$)/.test(path)
    )
      throw new Error('Account deletion is unavailable in this owner-only QA build.');
    // Supabase API calls should not redirect to another backend.
    return send(input, { ...init, redirect: 'error' });
  };
}
module.exports = { ownerQaTargetError, createOwnerQaFetch };
