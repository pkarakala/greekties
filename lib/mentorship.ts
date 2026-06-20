import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
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

export function useInbox(userId: string | null): InboxData {
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
        const rows = (data as MentorshipRequest[]) ?? [];
        setIncoming(rows.filter((r) => r.to_user_id === userId));
        setOutgoing(rows.filter((r) => r.from_user_id === userId));

        const others = rows.map((r) => (r.from_user_id === userId ? r.to_user_id : r.from_user_id));
        setProfiles(await profilesByUser(others));
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId, nonce]);

  const pendingIncoming = incoming.filter((r) => r.status === 'pending').length;

  return { loading, error, incoming, outgoing, profiles, pendingIncoming, reload };
}

export interface ThreadData {
  loading: boolean;
  error: string | null;
  request: MentorshipRequest | null;
  messages: Message[];
  other: Profile | null;
  reload: () => void;
}

export function useThread(requestId: string | null, userId: string | null): ThreadData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<MentorshipRequest | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

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
      setRequest(req);

      if (req) {
        const otherId = req.from_user_id === userId ? req.to_user_id : req.from_user_id;
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
        else setMessages((msgRes.data as Message[]) ?? []);
        setOther(profMap[otherId] ?? null);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [requestId, userId, nonce]);

  return { loading, error, request, messages, other, reload };
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
