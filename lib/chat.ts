import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getLastRead, getServerLastReads } from './reads';
import { canShowActorContent, filterBlockedActors } from './moderation';
import { useMessageThread } from './message-thread';
import type { Channel, ChannelMessage } from './types';

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

export function useChannels(
  chapterId: string | null,
  userId: string | null,
  blockedIds: ReadonlySet<string>,
): ChannelsData {
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
            .limit(20);

          const lastMessage =
            filterBlockedActors(
              (msgs as ChannelMessage[]) ?? [],
              blockedIds,
              (message) => message.sender_id,
            )[0] ?? null;
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
  }, [chapterId, userId, blockedIds, nonce]);

  const visibleSections = sections.map((section) => ({
    ...section,
    data: section.data.map((item) =>
      item.lastMessage && !canShowActorContent(item.lastMessage.sender_id, blockedIds)
        ? {
            ...item,
            lastMessage: null,
            lastActivity: item.channel.created_at,
            unread: false,
          }
        : item,
    ),
  }));

  return { loading, error, sections: visibleSections, reload };
}

export function useChannelThread(
  channelId: string | null,
  userId: string | null,
  blockedIds: ReadonlySet<string>,
) {
  const thread = useMessageThread('channel', channelId, userId, blockedIds);
  return {
    loading: thread.loading,
    error: thread.error,
    channel: thread.parent as Channel | null,
    messages: thread.messages as ChannelMessage[],
    senders: thread.profiles,
    hasMore: thread.hasMore,
    loadingEarlier: thread.loadingEarlier,
    loadEarlier: thread.loadEarlier,
    reload: thread.reload,
    composer: thread.composer,
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
