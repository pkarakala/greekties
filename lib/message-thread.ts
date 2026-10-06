import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { canShowActorContent, filterBlockedActors } from './moderation';
import { createRealtimeTopic } from './realtime';
import {
  conversationColumn,
  messageTable,
  readConversation,
  readMessage,
  type ConversationKind,
  type TextMessage,
} from './message-send';
import {
  useMessageRecovery,
  recoveryIsCurrent,
  discardConversationRecovery,
  confirmRecoveredMessage,
  forgetDeletedMessage,
  mergeMessages,
  consumeConfirmedMessages,
  clearConversationDraft,
  retryConversationAccess,
} from './message-recovery';
import type { Channel, MentorshipRequest, Profile } from './types';

const PAGE_SIZE = 50;
interface ThreadState {
  parent: Channel | MentorshipRequest | null;
  messages: TextMessage[];
  profiles: Record<string, Profile>;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingEarlier: boolean;
}
const EMPTY: ThreadState = {
  parent: null,
  messages: [],
  profiles: {},
  loading: true,
  error: null,
  hasMore: false,
  loadingEarlier: false,
};

/** Shared lifecycle for the two text conversations. Async work belongs to a
 * particular recovery entry and effect lifetime, never just a route string. */
export function useMessageThread(
  kind: ConversationKind,
  id: string | null,
  userId: string | null,
  blockedIds: ReadonlySet<string>,
) {
  const composer = useMessageRecovery(kind, id, userId);
  const { entry } = composer;
  const [nonce, setNonce] = useState(0);
  const [stored, setStored] = useState<{ entry: typeof entry; value: ThreadState }>({
    entry: null,
    value: EMPTY,
  });
  const state = stored.entry === entry && recoveryIsCurrent(entry) ? stored.value : EMPTY;
  const controller = useRef<{
    earlier: () => Promise<void>;
    accept: (rows: TextMessage[]) => void;
  } | null>(null);
  const reload = useCallback(() => {
    retryConversationAccess(entry);
    setNonce((n) => n + 1);
  }, [entry]);
  const loadEarlier = useCallback(async () => {
    await controller.current?.earlier();
  }, []);

  useEffect(() => {
    if (!id || !userId || !recoveryIsCurrent(entry)) return;
    let active = true;
    let loadingEarlier = false;
    let cursor: string | null = null;
    let loadVersion = 0;
    let arrivals: TextMessage[] = [];
    const current = () => active && recoveryIsCurrent(entry);
    const change = (fn: (value: ThreadState) => ThreadState) => {
      if (!current()) return;
      setStored((previous) =>
        current()
          ? { entry, value: fn(previous.entry === entry ? previous.value : EMPTY) }
          : previous,
      );
    };
    const fail = () =>
      change((s) => ({
        ...s,
        loading: false,
        loadingEarlier: false,
        error: 'Couldn’t load messages. Try again.',
      }));
    const revoke = () => {
      if (!current()) return;
      discardConversationRecovery(entry);
      setStored({
        entry,
        value: { ...EMPTY, loading: false, error: 'This conversation is no longer available.' },
      });
    };
    const profiles = async (ids: string[]) => {
      if (!current() || ids.length === 0) return;
      try {
        const result = await supabase
          .from('profiles')
          .select('*')
          .in('user_id', [...new Set(ids)]);
        if (!current() || result.error) return;
        const additions: Record<string, Profile> = {};
        for (const p of (result.data as Profile[]) ?? []) additions[p.user_id] = p;
        change((s) => ({ ...s, profiles: { ...s.profiles, ...additions } }));
      } catch {
        /* Message content remains usable without profile decoration. */
      }
    };
    const accept = (rows: TextMessage[]) => {
      if (!current()) return;
      const visible = filterBlockedActors(rows, blockedIds, (m) => m.sender_id);
      arrivals = mergeMessages(arrivals, visible, entry.deleted);
      visible.forEach((m) => confirmRecoveredMessage(entry, m));
      change((s) => ({ ...s, messages: mergeMessages(s.messages, visible, entry.deleted) }));
      void profiles(visible.map((m) => m.sender_id));
    };
    const load = async () => {
      const version = ++loadVersion;
      arrivals = [];
      change((s) => ({ ...s, loading: !s.parent, loadingEarlier: false, error: null }));
      try {
        const parent = await readConversation(kind, id);
        if (!current() || version !== loadVersion) return;
        if (parent.error) {
          fail();
          return;
        }
        const row = parent.data as Channel | MentorshipRequest | null;
        if (!row) {
          revoke();
          return;
        }
        if (kind === 'mentorship') {
          const request = row as MentorshipRequest;
          const participant = request.from_user_id === userId || request.to_user_id === userId;
          const other = request.from_user_id === userId ? request.to_user_id : request.from_user_id;
          if (!participant || !canShowActorContent(other, blockedIds)) {
            revoke();
            return;
          }
          void profiles([other]);
          if (request.status !== 'accepted') {
            // Pending requests still render their acceptance controls; they have
            // no send state. A formerly accepted thread loses private recovery.
            if (entry.state.attempt || entry.state.draft || entry.state.confirmed.length) {
              clearConversationDraft(entry);
            }
            setStored({ entry, value: { ...EMPTY, parent: row, loading: false } });
            return;
          }
        }
        change((s) => ({ ...s, parent: row }));
        let query = supabase
          .from(messageTable(kind))
          .select('*')
          .eq(conversationColumn(kind), id)
          .order('created_at', { ascending: kind === 'mentorship' });
        if (kind === 'channel') query = query.limit(PAGE_SIZE);
        const result = await query;
        if (!current() || version !== loadVersion) return;
        if (result.error) {
          fail();
          return;
        }
        const rows = (result.data as TextMessage[]) ?? [];
        const sorted = mergeMessages([], rows);
        cursor = sorted[0]?.created_at ?? null;
        const visible = filterBlockedActors(sorted, blockedIds, (m) => m.sender_id);
        visible.forEach((m) => confirmRecoveredMessage(entry, m));
        void profiles(visible.map((m) => m.sender_id));
        change((s) => ({
          ...s,
          messages: mergeMessages(visible, arrivals, entry.deleted),
          loading: false,
          hasMore: kind === 'channel' && rows.length === PAGE_SIZE,
        }));
      } catch {
        if (version === loadVersion) fail();
      }
    };
    const earlier = async () => {
      if (!current() || loadingEarlier || !cursor || kind !== 'channel') return;
      loadingEarlier = true;
      change((s) => ({ ...s, loadingEarlier: true, error: null }));
      try {
        const result = await supabase
          .from(messageTable(kind))
          .select('*')
          .eq(conversationColumn(kind), id)
          .lt('created_at', cursor)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        if (!current()) return;
        if (result.error) {
          fail();
          return;
        }
        const rows = mergeMessages([], (result.data as TextMessage[]) ?? []);
        if (rows.length) cursor = rows[0].created_at;
        accept(rows);
        change((s) => ({ ...s, hasMore: rows.length === PAGE_SIZE, loadingEarlier: false }));
      } catch {
        fail();
      } finally {
        loadingEarlier = false;
      }
    };
    controller.current = { earlier, accept };
    // Subscribe before loading so a delayed snapshot cannot erase a newer event.
    const subscription = supabase
      .channel(createRealtimeTopic(kind, id))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: messageTable(kind),
          filter: `${conversationColumn(kind)}=eq.${id}`,
        },
        (payload) => {
          const messageId = (payload.new as TextMessage)?.id;
          if (!current() || !messageId || entry.deleted.has(messageId)) return;
          // Re-read using the current authenticated SELECT policy. A payload alone
          // never resolves an uncertain send or bypasses a changed block/access rule.
          const version = loadVersion;
          void (async () => {
            try {
              const result = await readMessage(kind, id, messageId);
              if (current() && version === loadVersion && !result.error && result.data) accept([result.data]);
            } catch {
              /* Recovery remains uncertain; explicit retry is available. */
            }
          })();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: messageTable(kind),
          filter: `${conversationColumn(kind)}=eq.${id}`,
        },
        (payload) => {
          if (!current()) return;
          const deletedId = (payload.old as Partial<TextMessage>)?.id;
          if (!deletedId) return;
          forgetDeletedMessage(entry, deletedId);
          change((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== deletedId) }));
        },
      );
    if (kind === 'mentorship')
      subscription.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mentorship_requests',
          filter: `id=eq.${id}`,
        },
        () => {
          if (current()) void load();
        },
      );
    subscription.subscribe();
    void load();
    return () => {
      active = false;
      controller.current = null;
      void supabase.removeChannel(subscription);
    };
  }, [kind, id, userId, entry, blockedIds, nonce]);

  useEffect(() => {
    if (!entry || !composer.confirmed.length || !recoveryIsCurrent(entry)) return;
    controller.current?.accept(composer.confirmed);
    consumeConfirmedMessages(entry, new Set(composer.confirmed.map((m) => m.id)));
  }, [entry, composer.confirmed]);

  const revoked = !!entry?.revoked;
  const parent = revoked ? null : state.parent;
  return {
    ...state,
    loading: revoked ? false : state.loading,
    error: revoked ? 'This conversation is no longer available.' : state.error,
    parent,
    messages: parent && (kind === 'channel' || (parent as MentorshipRequest).status === 'accepted')
      ? filterBlockedActors(
          mergeMessages(state.messages, composer.confirmed, entry?.deleted),
          blockedIds,
          (m) => m.sender_id,
        )
      : [],
    composer,
    reload,
    loadEarlier,
  };
}
