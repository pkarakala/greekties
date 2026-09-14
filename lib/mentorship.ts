import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { canShowActorContent, filterBlockedActors } from './moderation';
import { createRealtimeTopic } from './realtime';
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

export interface ThreadData {
  loading: boolean;
  error: string | null;
  request: MentorshipRequest | null;
  messages: Message[];
  other: Profile | null;
  reload: () => void;
}

export function useThread(
  requestId: string | null,
  userId: string | null,
  blockedIds: ReadonlySet<string>,
): ThreadData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<MentorshipRequest | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Users this viewer has blocked — their messages are hidden (initial + realtime).
  const blockedRef = useRef<ReadonlySet<string>>(blockedIds);
  useEffect(() => {
    blockedRef.current = blockedIds;
  }, [blockedIds]);

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      const reqRes = await supabase
        .from('mentorship_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();

      if (!mounted) return;
      if (reqRes.error) {
        setError(reqRes.error.message);
        setLoading(false);
        return;
      }
      const req = (reqRes.data as MentorshipRequest) ?? null;
      const otherId = req
        ? req.from_user_id === userId
          ? req.to_user_id
          : req.from_user_id
        : null;
      const visibleRequest = req && canShowActorContent(otherId, blockedIds) ? req : null;
      setRequest(visibleRequest);

      if (visibleRequest && otherId) {
        const [msgRes, profMap] = await Promise.all([
          supabase
            .from('messages')
            .select('*')
            .eq('request_id', requestId)
            .order('created_at', { ascending: true }),
          profilesByUser([otherId]),
        ]);
        if (!mounted) return;
        if (msgRes.error) setError(msgRes.error.message);
        else {
          const msgs = (msgRes.data as Message[]) ?? [];
          setMessages(filterBlockedActors(msgs, blockedRef.current, (m) => m.sender_id));
        }
        setOther(profMap[otherId] ?? null);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [requestId, userId, blockedIds, nonce]);

  // Realtime (mirrors lib/chat.ts): append new messages as they arrive (deduped by
  // id, blocked filtered) and pick up status changes (pending → accepted/declined)
  // so 'Waiting for a response…' flips live for the requester.
  useEffect(() => {
    if (!requestId) return;

    const sub = supabase
      .channel(createRealtimeTopic('thread', requestId))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (!canShowActorContent(msg.sender_id, blockedRef.current)) return;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mentorship_requests',
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          const next = payload.new as MentorshipRequest;
          const otherId = next.from_user_id === userId ? next.to_user_id : next.from_user_id;
          if (!canShowActorContent(otherId, blockedRef.current)) return;
          setRequest(next);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [requestId, userId]);

  const otherUserId = request
    ? request.from_user_id === userId
      ? request.to_user_id
      : request.from_user_id
    : null;
  const visibleRequest =
    request && canShowActorContent(otherUserId, blockedIds) ? request : null;
  return {
    loading,
    error,
    request: visibleRequest,
    messages: visibleRequest
      ? filterBlockedActors(messages, blockedIds, (message) => message.sender_id)
      : [],
    other: visibleRequest ? other : null,
    reload,
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

export async function sendMessage(
  requestId: string,
  senderId: string,
  content: string,
): Promise<string | null> {
  const { error } = await supabase
    .from('messages')
    .insert({ request_id: requestId, sender_id: senderId, content });
  return error?.message ?? null;
}
