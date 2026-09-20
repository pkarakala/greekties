import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { canShowActorContent, filterBlockedActors } from './moderation';
import { useMessageThread } from './message-thread';
import type { Message, MentorshipRequest, Profile, RequestStatus } from './types';

/** Fetch profiles for a set of auth user ids, keyed by user_id. */
async function profilesByUser(userIds: string[]): Promise<Record<string, Profile>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return {};
  const { data } = await supabase.from('profiles').select('*').in('user_id', unique);
  const map: Record<string, Profile> = {};
  for (const p of (data as Profile[]) ?? []) map[p.user_id] = p;
  return map;
}

export interface InboxData {
  loading: boolean;
  error: string | null;
  incoming: MentorshipRequest[];
  outgoing: MentorshipRequest[];
  profiles: Record<string, Profile>;
  pendingIncoming: number;
  reload: () => void;
}

export function useInbox(
  userId: string | null,
  blockedIds: ReadonlySet<string>,
): InboxData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<MentorshipRequest[]>([]);
  const [outgoing, setOutgoing] = useState<MentorshipRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    supabase
      .from('mentorship_requests')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .then(async ({ data, error: err }) => {
        if (!mounted) return;
        if (err) {
          setError(err.message);
          setLoading(false);
          return;
        }
        const rows = filterBlockedActors(
          (data as MentorshipRequest[]) ?? [],
          blockedIds,
          (row) => (row.from_user_id === userId ? row.to_user_id : row.from_user_id),
        );
        setIncoming(rows.filter((r) => r.to_user_id === userId));
        setOutgoing(rows.filter((r) => r.from_user_id === userId));

        const others = rows.map((r) => (r.from_user_id === userId ? r.to_user_id : r.from_user_id));
        setProfiles(await profilesByUser(others));
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId, blockedIds, nonce]);

  const visibleIncoming = filterBlockedActors(incoming, blockedIds, (row) => row.from_user_id);
  const visibleOutgoing = filterBlockedActors(outgoing, blockedIds, (row) => row.to_user_id);
  const pendingIncoming = visibleIncoming.filter((r) => r.status === 'pending').length;

  return {
    loading,
    error,
    incoming: visibleIncoming,
    outgoing: visibleOutgoing,
    profiles,
    pendingIncoming,
    reload,
  };
}

export function useThread(
  requestId: string | null,
  userId: string | null,
  blockedIds: ReadonlySet<string>,
) {
  const thread = useMessageThread('mentorship', requestId, userId, blockedIds);
  const request = thread.parent as MentorshipRequest | null;
  const otherId = request?.from_user_id === userId ? request?.to_user_id : request?.from_user_id;
  const visible = request && canShowActorContent(otherId, blockedIds);
  return {
    loading: thread.loading,
    error: thread.error,
    request: visible ? request : null,
    messages: visible ? (thread.messages as Message[]) : [],
    other: visible && otherId ? (thread.profiles[otherId] ?? null) : null,
    reload: thread.reload,
    composer: thread.composer,
  };
}

export async function createMentorshipRequest(input: {
  fromUserId: string;
  toUserId: string;
  chapterId: string;
  message: string;
  focusAreas?: string[];
  preferredFormat?: string;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('mentorship_requests')
    .insert({
      from_user_id: input.fromUserId,
      to_user_id: input.toUserId,
      chapter_id: input.chapterId,
      message: input.message,
      focus_areas: input.focusAreas ?? null,
      preferred_format: input.preferredFormat ?? null,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();

  return { id: (data?.id as string) ?? null, error: error?.message ?? null };
}

/** Find an existing request between two users (either direction), if any. */
export async function findRequestBetween(
  meUserId: string,
  otherUserId: string,
): Promise<MentorshipRequest | null> {
  const { data } = await supabase
    .from('mentorship_requests')
    .select('*')
    .or(
      `and(from_user_id.eq.${meUserId},to_user_id.eq.${otherUserId}),` +
        `and(from_user_id.eq.${otherUserId},to_user_id.eq.${meUserId})`,
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MentorshipRequest) ?? null;
}

export async function respondToRequest(
  requestId: string,
  status: Extract<RequestStatus, 'accepted' | 'declined'>,
): Promise<string | null> {
  const { error } = await supabase
    .from('mentorship_requests')
    .update({ status })
    .eq('id', requestId);
  return error?.message ?? null;
}
