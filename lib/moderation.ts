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

// ── Admin report queue ───────────────────────────────────────────────────────
// Chapter admins triage reports filed in their chapter (App Store guideline
// 1.2 "timely responses"). RLS ("Admins read/update chapter reports" in
// app-v2-moderation.sql) scopes both reads and writes server-side.

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

/** A row from `content_reports` (see app-v2-moderation.sql). */
export interface ContentReport {
  id: string;
  reporter_id: string;
  chapter_id: string | null;
  target_type: ReportTargetType;
  target_id: string;
  reason: string | null;
  /** 'open' by default; admins move it to 'resolved' or 'dismissed'. */
  status: string;
  created_at: string;
}

export interface ChapterReportsData {
  loading: boolean;
  error: string | null;
  reports: ContentReport[];
  reload: () => void;
}

/** Open reports first, newest first within each group. */
function sortReports(rows: ContentReport[]): ContentReport[] {
  return [...rows].sort((a, b) => {
    const aOpen = a.status === 'open' ? 0 : 1;
    const bOpen = b.status === 'open' ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  });
}

/**
 * Reports filed in the given chapter, for the admin moderation queue.
 * Empty list (no error) when the moderation migration hasn't run yet.
 */
export function useChapterReports(chapterId: string | null): ChapterReportsData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!chapterId) {
      setReports([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('content_reports')
          .select('id, reporter_id, chapter_id, target_type, target_id, reason, status, created_at')
          .eq('chapter_id', chapterId)
          .order('created_at', { ascending: false });
        if (!mounted) return;
        if (err) {
          // Table missing (pre-migration) → behave like an empty queue.
          if (!isMissingTable(err.message)) {
            setError('Couldn’t load reports. Pull to refresh to try again.');
          }
          setReports([]);
        } else {
          setReports(sortReports((data as ContentReport[]) ?? []));
        }
      } catch {
        if (!mounted) return;
        setError('Couldn’t load reports. Pull to refresh to try again.');
        setReports([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  return { loading, error, reports, reload };
}

/** Admin action: mark a report open / resolved / dismissed. */
export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('content_reports')
      .update({ status })
      .eq('id', reportId);
    if (!error) return { error: null };
    return {
      error: isMissingTable(error.message)
        ? NOT_AVAILABLE
        : 'Couldn’t update the report. Please try again.',
    };
  } catch {
    return { error: 'Couldn’t update the report. Please try again.' };
  }
}

// ── Blocked-members management ───────────────────────────────────────────────
// Settings screen where users review and undo their blocks. Joins `user_blocks`
// to `profiles` client-side (no FK between them the app can rely on).

// Only what the blocked list renders — keeps PII (email, coords) off the wire.
const BLOCKED_PROFILE_COLUMNS = 'id, user_id, name, avatar_url, role, company';

/** The slice of a profile the blocked-members list renders. */
export interface BlockedMemberProfile {
  id: string;
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  role: string | null;
  company: string | null;
}

export interface BlockedEntry {
  /** Null when the blocked account no longer has a profile (e.g. deleted). */
  profile: BlockedMemberProfile | null;
  /** The blocked auth user id — what `unblockUser` needs. */
  blockedId: string;
}

export interface BlockedProfilesData {
  loading: boolean;
  error: string | null;
  blocked: BlockedEntry[];
  reload: () => void;
}

/**
 * Everyone the given user has blocked, with their profiles for display.
 * Empty list (no error) when the moderation migration hasn't run yet.
 */
export function useBlockedProfiles(userId: string | null): BlockedProfilesData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BlockedEntry[]>([]);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!userId) {
      setBlocked([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data: rows, error: blocksErr } = await supabase
          .from('user_blocks')
          .select('blocked_id')
          .eq('blocker_id', userId)
          .order('created_at', { ascending: false });
        if (!mounted) return;
        if (blocksErr) {
          // Table missing (pre-migration) → behave like an empty block list.
          if (!isMissingTable(blocksErr.message)) {
            setError('Couldn’t load your blocked members. Pull to refresh to try again.');
          }
          setBlocked([]);
          return;
        }

        const blockedIds = (rows ?? []).map((row) => row.blocked_id as string);
        if (blockedIds.length === 0) {
          setBlocked([]);
          return;
        }

        // Blocked accounts may have no profile row (deleted account) — keep
        // the entry so the user can still unblock them.
        const byUserId = new Map<string, BlockedMemberProfile>();
        const { data: profiles, error: profilesErr } = await supabase
          .from('profiles')
          .select(BLOCKED_PROFILE_COLUMNS)
          .in('user_id', blockedIds);
        if (!mounted) return;
        if (!profilesErr) {
          for (const p of (profiles as BlockedMemberProfile[]) ?? []) {
            byUserId.set(p.user_id, p);
          }
        }

        setBlocked(blockedIds.map((id) => ({ blockedId: id, profile: byUserId.get(id) ?? null })));
      } catch {
        if (!mounted) return;
        setError('Couldn’t load your blocked members. Pull to refresh to try again.');
        setBlocked([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, nonce]);

  return { loading, error, blocked, reload };
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
