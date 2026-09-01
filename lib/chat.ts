import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { getLastRead, getServerLastReads } from './reads';
import { fetchBlockedIds } from './moderation';
import { createRealtimeTopic } from './realtime';
import type { Channel, ChannelMessage, Profile } from './types';

/** Messages fetched per page (initial load + each "load earlier"). */
const PAGE_SIZE = 50;

export interface ChannelListItem {
  channel: Channel;
  lastMessage: ChannelMessage | null;
  lastActivity: string; // ISO; channel.created_at when no messages yet
  unread: boolean;
}

export interface ChannelSection {
  title: string;
  data: ChannelListItem[];
}

function sectionTitle(visibility: Channel['visibility']): string {
  if (visibility === 'alumni_only') return 'ALUMNI';
  if (visibility === 'exec_only') return 'EXEC';
  return 'CHANNELS';
}

const SECTION_ORDER = ['CHANNELS', 'EXEC', 'ALUMNI'];

export interface ChannelsData {
  loading: boolean;
  error: string | null;
  sections: ChannelSection[];
  reload: () => void;
}

export function useChannels(chapterId: string | null, userId: string | null): ChannelsData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<ChannelSection[]>([]);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!chapterId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      // RLS filters out channels this user can't see (alumni_only / exec_only).
      const { data, error: err } = await supabase
        .from('channels')
        .select('*')
        .eq('chapter_id', chapterId);

      if (!mounted) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const channels = (data as Channel[]) ?? [];

      // Server-side reads (channel_members.last_read_at) fetched once for all
      // channels; empty map on error/pre-migration. Merged with the local
      // timestamp per channel below — server may lag local on this device,
      // and local won't exist on a freshly signed-in device.
      const serverReads = userId ? await getServerLastReads(userId) : new Map<string, number>();

      const items: ChannelListItem[] = await Promise.all(
        channels.map(async (channel) => {
          const { data: msgs } = await supabase
            .from('channel_messages')
            .select('*')
            .eq('channel_id', channel.id)
            .order('created_at', { ascending: false })
            .limit(1);

          const lastMessage = ((msgs as ChannelMessage[]) ?? [])[0] ?? null;
          const lastActivity = lastMessage?.created_at ?? channel.created_at;
          const localRead = await getLastRead(channel.id);
          const lastRead = Math.max(serverReads.get(channel.id) ?? 0, localRead);
          const unread =
            !!lastMessage &&
            new Date(lastMessage.created_at).getTime() > lastRead &&
            lastMessage.sender_id !== userId;

          return { channel, lastMessage, lastActivity, unread };
        }),
      );

      if (!mounted) return;

      // Group by visibility, sort channels within a section by recency.
      const grouped = new Map<string, ChannelListItem[]>();
      for (const item of items) {
        const title = sectionTitle(item.channel.visibility);
        const list = grouped.get(title) ?? [];
        list.push(item);
        grouped.set(title, list);
      }
      for (const list of grouped.values()) {
        list.sort((a, b) => +new Date(b.lastActivity) - +new Date(a.lastActivity));
      }

      const ordered: ChannelSection[] = SECTION_ORDER.filter((t) => grouped.has(t)).map(
        (title) => ({ title, data: grouped.get(title)! }),
      );

      setSections(ordered);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [chapterId, userId, nonce]);

  return { loading, error, sections, reload };
}

export interface ChannelThreadData {
  loading: boolean;
  error: string | null;
  channel: Channel | null;
  messages: ChannelMessage[];
  /** sender auth user_id → their profile (for name/avatar/grad year + profile link). */
  senders: Record<string, Profile>;
  /** True when older messages exist beyond what's loaded. */
  hasMore: boolean;
  /** True while a loadEarlier() page is in flight. */
  loadingEarlier: boolean;
  /** Fetch the page of messages before the oldest loaded one and prepend it. */
  loadEarlier: () => Promise<void>;
  send: (content: string) => Promise<void>;
  reload: () => void;
}

export function useChannelThread(
  channelId: string | null,
  userId: string | null,
): ChannelThreadData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [senders, setSenders] = useState<Record<string, Profile>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const sendersRef = useRef(senders);
  useEffect(() => {
    sendersRef.current = senders;
  }, [senders]);
  // Pagination cursor: created_at of the oldest *fetched* message (blocked
  // messages included, so a fully-blocked page still advances the cursor).
  const oldestFetchedRef = useRef<string | null>(null);
  // Users this viewer has blocked — their messages are hidden (initial + realtime).
  const blockedRef = useRef<Set<string>>(new Set());

  const ensureSenderProfiles = useCallback(async (userIds: string[]) => {
    const missing = [...new Set(userIds)].filter((id) => id && !sendersRef.current[id]);
    if (missing.length === 0) return;
    const { data } = await supabase.from('profiles').select('*').in('user_id', missing);
    const additions: Record<string, Profile> = {};
    for (const p of (data as Profile[]) ?? []) additions[p.user_id] = p;
    if (Object.keys(additions).length > 0) {
      setSenders((prev) => ({ ...prev, ...additions }));
    }
  }, []);

  // Initial load (channel + blocked ids + last page of messages + sender profiles).
  useEffect(() => {
    if (!channelId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      // Blocked ids first so the initial page can be filtered (empty set on any error).
      if (userId) blockedRef.current = await fetchBlockedIds(userId);

      const [chanRes, msgRes] = await Promise.all([
        supabase.from('channels').select('*').eq('id', channelId).maybeSingle(),
        supabase
          .from('channel_messages')
          .select('*')
          .eq('channel_id', channelId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE),
      ]);

      if (!mounted) return;
      if (chanRes.error || msgRes.error) {
        setError((chanRes.error || msgRes.error)?.message ?? 'Failed to load channel.');
        setLoading(false);
        return;
      }

      setChannel((chanRes.data as Channel) ?? null);
      // Fetched newest-first; reverse to oldest-first for display.
      const page = ((msgRes.data as ChannelMessage[]) ?? []).reverse();
      oldestFetchedRef.current = page[0]?.created_at ?? null;
      setHasMore(page.length === PAGE_SIZE);
      const msgs = page.filter((m) => !blockedRef.current.has(m.sender_id));
      setMessages(msgs);
      await ensureSenderProfiles(msgs.map((m) => m.sender_id));
      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [channelId, userId, nonce, ensureSenderProfiles]);

  // Pagination: fetch the PAGE_SIZE messages before the oldest fetched and prepend.
  const loadEarlier = useCallback(async () => {
    const cursor = oldestFetchedRef.current;
    if (!channelId || !cursor || loadingEarlier) return;
    setLoadingEarlier(true);

    const { data, error: err } = await supabase
      .from('channel_messages')
      .select('*')
      .eq('channel_id', channelId)
      .lt('created_at', cursor)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (err) {
      setError(err.message);
      setLoadingEarlier(false);
      return;
    }

    const page = ((data as ChannelMessage[]) ?? []).reverse();
    if (page.length > 0) oldestFetchedRef.current = page[0].created_at;
    setHasMore(page.length === PAGE_SIZE);
    const older = page.filter((m) => !blockedRef.current.has(m.sender_id));
    if (older.length > 0) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !seen.has(m.id)), ...prev];
      });
      void ensureSenderProfiles(older.map((m) => m.sender_id));
    }
    setLoadingEarlier(false);
  }, [channelId, loadingEarlier, ensureSenderProfiles]);

  // Realtime: append new messages as they arrive (deduped by id, blocked
  // filtered) and remove deleted ones. DELETE payloads carry the old row only
  // because channel_messages has REPLICA IDENTITY FULL (app-v4-chat-delete.sql)
  // — pre-migration the payload's old record may be empty, so guard the id.
  useEffect(() => {
    if (!channelId) return;

    const sub = supabase
      .channel(createRealtimeTopic('room', channelId))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const msg = payload.new as ChannelMessage;
          if (blockedRef.current.has(msg.sender_id)) return;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          void ensureSenderProfiles([msg.sender_id]);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const deletedId = (payload.old as Partial<ChannelMessage> | undefined)?.id;
          if (!deletedId) return;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [channelId, ensureSenderProfiles]);

  const send = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || !channelId || !userId) return;

      const { data, error: err } = await supabase
        .from('channel_messages')
        .insert({ channel_id: channelId, sender_id: userId, content: trimmed })
        .select('*')
        .maybeSingle();

      if (err) {
        setError(err.message);
        return;
      }
      // Append immediately (realtime may also deliver it — dedupe by id).
      if (data) {
        const msg = data as ChannelMessage;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    },
    [channelId, userId],
  );

  return {
    loading,
    error,
    channel,
    messages,
    senders,
    hasMore,
    loadingEarlier,
    loadEarlier,
    send,
    reload,
  };
}

/**
 * Delete one channel message. Allowed for the sender ("Delete own messages")
 * and for chapter owner/manager admins ("Admins delete chapter channel
 * messages") — both policies live in app-v4-chat-delete.sql.
 *
 * An RLS-denied delete is NOT a Postgres error: it silently matches 0 rows.
 * So we `.select('id')` on the delete and treat an empty result as failure —
 * this also covers the pre-migration DB (no delete policy → 0 rows for
 * everyone). Never surfaces a raw Postgres error.
 */
export async function deleteMessage(messageId: string): Promise<{ error: string | null }> {
  const FAILED = 'Couldn’t delete this message.';
  try {
    const { data, error } = await supabase
      .from('channel_messages')
      .delete()
      .eq('id', messageId)
      .select('id');
    if (error) return { error: FAILED };
    if (!data || data.length === 0) return { error: FAILED };
    return { error: null };
  } catch {
    return { error: FAILED };
  }
}
