import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { getLastRead } from './reads';
import type { Channel, ChannelMessage, Profile } from './types';

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
          const lastRead = await getLastRead(channel.id);
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
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const sendersRef = useRef(senders);
  sendersRef.current = senders;

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

  // Initial load (channel + messages + sender profiles).
  useEffect(() => {
    if (!channelId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      const [chanRes, msgRes] = await Promise.all([
        supabase.from('channels').select('*').eq('id', channelId).maybeSingle(),
        supabase
          .from('channel_messages')
          .select('*')
          .eq('channel_id', channelId)
          .order('created_at', { ascending: true }),
      ]);

      if (!mounted) return;
      if (chanRes.error || msgRes.error) {
        setError((chanRes.error || msgRes.error)?.message ?? 'Failed to load channel.');
        setLoading(false);
        return;
      }

      setChannel((chanRes.data as Channel) ?? null);
      const msgs = (msgRes.data as ChannelMessage[]) ?? [];
      setMessages(msgs);
      await ensureSenderProfiles(msgs.map((m) => m.sender_id));
      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [channelId, nonce, ensureSenderProfiles]);

  // Realtime: append new messages as they arrive (deduped by id).
  useEffect(() => {
    if (!channelId) return;

    const sub = supabase
      .channel(`room:${channelId}`)
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
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          void ensureSenderProfiles([msg.sender_id]);
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

  return { loading, error, channel, messages, senders, send, reload };
}
