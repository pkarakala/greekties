import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

// UGC moderation (App Store guideline 1.2): report content + block users.
// Backed by the `content_reports` and `user_blocks` tables. Both may not exist
// in the live DB yet, so every call degrades gracefully — no raw Postgres
// errors ever reach the UI.

export type ReportTargetType = 'profile' | 'channel_message' | 'mentorship_message' | 'job';

/** True for "relation does not exist" — the moderation migration hasn't run. */
function isMissingTable(message: string): boolean {
  return /does not exist|schema cache/i.test(message);
}

const NOT_AVAILABLE =
  'This feature isn’t available yet. Email support@greekties.app and we’ll handle it.';

/** File a report against a piece of content. Reviewed by the Greek Ties team. */
export async function reportContent(input: {
  reporterId: string;
  chapterId: string | null;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: input.reporterId,
    chapter_id: input.chapterId,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
  });
  if (!error) return { error: null };
  return { error: isMissingTable(error.message) ? NOT_AVAILABLE : 'Couldn’t submit the report. Please try again.' };
}

/** Block a user — their content is hidden everywhere for the blocker. */
export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_blocks').insert({
    blocker_id: blockerId,
    blocked_id: blockedId,
  });
  if (!error) return { error: null };
  // Already blocked (unique violation) is a success from the user's POV.
  if (/duplicate key/i.test(error.message)) return { error: null };
  return { error: isMissingTable(error.message) ? NOT_AVAILABLE : 'Couldn’t block this member. Please try again.' };
}

export async function unblockUser(
  blockerId: string,
  blockedId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (!error) return { error: null };
  return { error: isMissingTable(error.message) ? NOT_AVAILABLE : 'Couldn’t unblock this member. Please try again.' };
}

/**
 * User ids (`auth.uid()` values) the given user has blocked. Returns an empty
 * set on any error (including the table not existing yet) so callers can
 * always safely filter with it.
 */
export async function fetchBlockedIds(userId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', userId);
    if (error || !data) return new Set();
    return new Set(data.map((row) => row.blocked_id as string));
  } catch {
    return new Set();
  }
}

/** The signed-in user's block list, for filtering feeds/directories. */
export function useBlockedIds(): { blockedIds: Set<string>; refresh: () => Promise<void> } {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!userId) {
      setBlockedIds(new Set());
      return;
    }
    setBlockedIds(await fetchBlockedIds(userId));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { blockedIds, refresh };
}
