import { supabase } from './supabase';

// Chapter creation + member-facing invites. Both RPCs live in migrations that
// may not have run against the live DB yet (see supabase/migrations/README.md),
// so every call degrades gracefully — no raw Postgres errors ever reach the UI.

const CREATE_FAILED = 'Couldn’t create your chapter. Please try again.';
const CREATE_NOT_AVAILABLE =
  'Creating chapters isn’t available yet. Ask your chapter for an invite link, or email support@greekties.app.';
const ALREADY_IN_CHAPTER =
  'You already belong to a chapter. Each account can only be in one chapter.';

/** True when the RPC doesn't exist yet — its migration hasn't run. */
function isMissingFunction(error: { code?: string; message: string }): boolean {
  return (
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    /function .* does not exist|schema cache/i.test(error.message)
  );
}

/**
 * True for permission/RLS denials (e.g. a non-admin minting an invite).
 * Includes the exact message create_chapter_invite raises for non-admins
 * (plpgsql RAISE → P0001, so there's no standard permission code to match).
 */
function isPermissionError(error: { code?: string; message: string }): boolean {
  return (
    error.code === '42501' ||
    /permission denied|not allowed|not authorized|only chapter admins/i.test(error.message)
  );
}

/**
 * Create a chapter (and the caller's owner profile) via the SECURITY DEFINER
 * `create_chapter` RPC. The server enforces one-chapter-per-account.
 */
export async function createChapter(input: {
  name: string;
  designation?: string;
  university?: string;
}): Promise<{ chapterId: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('create_chapter', {
      chapter_name: input.name.trim(),
      chapter_designation: input.designation?.trim() || null,
      university_name: input.university?.trim() || null,
    });

    if (!error) {
      return { chapterId: typeof data === 'string' ? data : null, error: null };
    }
    if (isMissingFunction(error)) return { chapterId: null, error: CREATE_NOT_AVAILABLE };
    // The RPC raises when the caller already has a profile.
    if (/already/i.test(error.message)) return { chapterId: null, error: ALREADY_IN_CHAPTER };
    return { chapterId: null, error: CREATE_FAILED };
  } catch {
    return { chapterId: null, error: CREATE_FAILED };
  }
}

/**
 * Mint (or fetch) the chapter's current invite code via `create_chapter_invite`.
 * The RPC only lets chapter admins mint, so non-admins — and any client running
 * before the invites migration — get `{ code: null }` silently. Callers should
 * treat a null code as "no shareable link available", never as a hard error.
 */
export async function fetchChapterInvite(
  chapterId: string,
): Promise<{ code: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('create_chapter_invite', {
      target_chapter_id: chapterId,
    });

    if (!error && typeof data === 'string' && data.length > 0) {
      return { code: data, error: null };
    }
    if (error && !isMissingFunction(error) && !isPermissionError(error)) {
      return { code: null, error: 'Couldn’t fetch an invite link right now.' };
    }
    return { code: null, error: null };
  } catch {
    return { code: null, error: null };
  }
}
