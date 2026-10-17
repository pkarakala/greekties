import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useSectionRead, type SectionRead } from './home';
import type { Channel, MentorshipRequest, Profile } from './types';

export interface ChatsInboxRow {
  key: string;
  kind: 'group' | 'mentorship';
  id: string;
  name: string;
  preview: string;
  activity: string | null;
  avatar: string | null;
  otherId?: string;
  senderId?: string;
}
export interface ChatsSource {
  rows: ChatsInboxRow[];
  hasMore: boolean;
  previewsUnavailable: boolean;
}

// Search covers the bounded loaded dataset; request dates are never activity.
const SOURCE_LIMIT = 100;
async function mapBounded<T, R>(items: T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await read(items[index]);
      }
    }),
  );
  return results;
}

async function latest(kind: ChatsInboxRow['kind'], id: string, blocked: ReadonlySet<string>) {
  let query = supabase
    .from(kind === 'group' ? 'channel_messages' : 'messages')
    .select('id, sender_id, content, created_at')
    .eq(kind === 'group' ? 'channel_id' : 'request_id', id);
  // Reverse blocks remain enforced by the existing authenticated RLS policies.
  if (blocked.size) query = query.not('sender_id', 'in', `(${[...blocked].join(',')})`);
  try {
    const result = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);
    if (result.error) return { message: null, failed: true };
    const message = result.data?.[0] as
      { sender_id: string; content: string; created_at: string } | undefined;
    return { message: message && !blocked.has(message.sender_id) ? message : null, failed: false };
  } catch {
    return { message: null, failed: true };
  }
}

export async function readChatsGroups(
  chapterId: string,
  blocked: ReadonlySet<string>,
  onDenied?: (channelId: string) => void,
): Promise<ChatsSource> {
  const result = await supabase
    .from('channels')
    .select('id, chapter_id, name, description')
    .eq('chapter_id', chapterId)
    .order('id')
    .limit(SOURCE_LIMIT + 1);
  if (result.error) throw new Error('Groups unavailable');
  const channels = ((result.data ?? []) as Channel[]).filter((c) => c.chapter_id === chapterId);
  let previewsUnavailable = false;
  let accessUnavailable = false;
  const rows = await mapBounded(channels.slice(0, SOURCE_LIMIT), async (channel) => {
    // Admin SELECT includes management-only channels. Reuse the conversation
    // visibility predicate, just as existing structured sharing does.
    try {
      const access = await supabase.rpc('is_channel_visible', { p_channel_id: channel.id });
      if (access.error) {
        accessUnavailable = true;
        return null;
      }
      if (access.data === false) onDenied?.(channel.id);
      if (access.data !== true) return null;
    } catch {
      accessUnavailable = true;
      return null;
    }
    const { message, failed } = await latest('group', channel.id, blocked);
    previewsUnavailable ||= failed;
    return {
      key: `group:${channel.id}`,
      kind: 'group' as const,
      id: channel.id,
      name: channel.name || 'Group',
      avatar: null,
      preview: failed
        ? 'Preview unavailable'
        : (message?.content ?? channel.description ?? 'No messages yet'),
      activity: message?.created_at ?? null,
      senderId: message?.sender_id,
    };
  });
  // Finish all visibility checks: an unavailable sibling must not suppress a denial.
  if (accessUnavailable) throw new Error('Group access unavailable');
  return {
    rows: rows.filter((row): row is NonNullable<typeof row> => row !== null),
    hasMore: channels.length > SOURCE_LIMIT,
    previewsUnavailable,
  };
}

export async function readChatsMentorship(
  chapterId: string,
  userId: string,
  blocked: ReadonlySet<string>,
): Promise<ChatsSource> {
  const result = await supabase
    .from('mentorship_requests')
    .select('id, chapter_id, from_user_id, to_user_id, status')
    .eq('chapter_id', chapterId)
    .eq('status', 'accepted')
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order('id')
    .limit(SOURCE_LIMIT + 1);
  if (result.error) throw new Error('Mentorship unavailable');
  const requests = ((result.data ?? []) as MentorshipRequest[]).filter(
    (r) =>
      r.chapter_id === chapterId &&
      r.status === 'accepted' &&
      (r.from_user_id === userId || r.to_user_id === userId) &&
      !blocked.has(r.from_user_id === userId ? r.to_user_id : r.from_user_id),
  );
  const loaded = requests.slice(0, SOURCE_LIMIT);
  const otherId = (r: MentorshipRequest) =>
    r.from_user_id === userId ? r.to_user_id : r.from_user_id;
  const profiles: Record<string, Pick<Profile, 'name' | 'avatar_url'>> = {};
  if (loaded.length) {
    const people = await supabase
      .from('profiles')
      .select('user_id, name, avatar_url')
      .in('user_id', [...new Set(loaded.map(otherId))]);
    if (people.error) throw new Error('Mentorship profiles unavailable');
    for (const p of people.data ?? []) profiles[p.user_id] = p;
  }
  let previewsUnavailable = false;
  const rows = await mapBounded(loaded, async (request) => {
    const person = profiles[otherId(request)];
    const { message, failed } = await latest('mentorship', request.id, blocked);
    previewsUnavailable ||= failed;
    return {
      key: `mentorship:${request.id}`,
      kind: 'mentorship' as const,
      id: request.id,
      name: person?.name?.trim() || 'Member',
      avatar: person?.avatar_url ?? null,
      otherId: otherId(request),
      senderId: message?.sender_id,
      preview: failed
        ? 'Preview unavailable'
        : (message?.content ?? 'Accepted mentorship · No messages yet'),
      activity: message?.created_at ?? null,
    };
  });
  return { rows, hasMore: requests.length > SOURCE_LIMIT, previewsUnavailable };
}

export function selectChatsRows(
  rows: ChatsInboxRow[],
  filter: 'All' | 'Groups',
  search: string,
): ChatsInboxRow[] {
  const query = search.trim().toLocaleLowerCase();
  return [...new Map(rows.map((row) => [row.key, row])).values()]
    .filter(
      (row) =>
        (filter === 'All' || row.kind === 'group') &&
        `${row.name} ${row.preview}`.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => {
      const time = (value: string | null) =>
        value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
      return time(b.activity) - time(a.activity) || a.key.localeCompare(b.key);
    });
}

/** Retain same-scope refresh data, but evict definitive denials as they arrive.
 * Both incremental evictions and final results belong to this effect lifetime. */
function useChatsGroups(
  scope: string,
  chapterId: string,
  blocked: ReadonlySet<string>,
): SectionRead<ChatsSource> {
  const [state, setState] = useState<{
    scope: string;
    data: ChatsSource | undefined;
    loading: boolean;
    error: boolean;
  }>({ scope, data: undefined, loading: !!scope, error: false });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let current = true;
    if (scope) {
      const onDenied = (id: string) => {
        if (!current) return;
        setState((previous) =>
          current && previous.scope === scope && previous.data
            ? {
                ...previous,
                data: { ...previous.data, rows: previous.data.rows.filter((r) => r.id !== id) },
              }
            : previous,
        );
      };
      void Promise.resolve()
        .then(() => {
          if (!current) return;
          setState((previous) => ({
            scope,
            data: previous.scope === scope ? previous.data : undefined,
            loading: true,
            error: false,
          }));
          return readChatsGroups(chapterId, blocked, onDenied);
        })
        .then(
          (data) => {
            if (current && data) setState({ scope, data, loading: false, error: false });
          },
          () => {
            if (current) setState((previous) => ({ ...previous, loading: false, error: true }));
          },
        );
    }
    return () => {
      current = false;
    };
  }, [scope, chapterId, blocked, revision]);
  return {
    ...(state.scope === scope && scope
      ? state
      : { data: undefined, loading: !!scope, error: false }),
    reload,
  };
}

export function useChatsInbox(
  scope: string,
  chapterId: string,
  userId: string,
  blocked: ReadonlySet<string>,
) {
  const mentorsRead = useCallback(
    () => readChatsMentorship(chapterId, userId, blocked),
    [chapterId, userId, blocked],
  );
  const groups = useChatsGroups(scope, chapterId, blocked);
  const mentors = useSectionRead(scope, mentorsRead);
  const rows = [...(groups.data?.rows ?? []), ...(mentors.data?.rows ?? [])]
    .filter((row) => !row.otherId || !blocked.has(row.otherId))
    .map((row) =>
      row.senderId && blocked.has(row.senderId)
        ? { ...row, preview: 'Preview unavailable', activity: null, senderId: undefined }
        : row,
    );
  return { groups, mentors, rows };
}
