import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { useChannelThread, deleteMessage } from '@/lib/chat';
import { reportContent } from '@/lib/moderation';
import { useTypingIndicator } from '@/lib/presence';
import { markChannelRead } from '@/lib/reads';
import { fetchReactions, toggleReaction, useReactionSync, QUICK_EMOJI } from '@/lib/reactions';
import type { ReactionsByMessage } from '@/lib/reactions';
import { clockTime } from '@/lib/time';
import { Avatar } from '@/components/Avatar';
import { ReactionPills } from '@/components/ReactionPills';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, radius, spacing, typography } from '@/theme';
import { isAdmin } from '@/lib/types';
import type { ChannelMessage } from '@/lib/types';

/**
 * Pure toggle of one (message, emoji) in the aggregated reactions map. It's
 * its own inverse, so the optimistic update and its error-revert both call it.
 */
function toggleInMap(map: ReactionsByMessage, messageId: string, emoji: string): ReactionsByMessage {
  const next = new Map(map);
  const list = (next.get(messageId) ?? []).map((r) => ({ ...r }));
  const entry = list.find((r) => r.emoji === emoji);
  if (entry) {
    entry.mine = !entry.mine;
    entry.count += entry.mine ? 1 : -1;
  } else {
    list.push({ emoji, count: 1, mine: true });
  }
  const kept = list.filter((r) => r.count > 0);
  if (kept.length === 0) next.delete(messageId);
  else next.set(messageId, kept);
  return next;
}

export default function ChannelThreadScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const { session, profile } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const { loading, error, channel, messages, senders, hasMore, loadingEarlier, loadEarlier, send } =
    useChannelThread(channelId ?? null, myUserId);

  // Ephemeral typing indicators over a Realtime broadcast room (no Postgres).
  const { typers, signalTyping } = useTypingIndicator(
    channelId ?? null,
    myUserId,
    profile?.name ?? null,
  );

  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChannelMessage>>(null);
  // Last message id we auto-scrolled to — lets us skip the scroll-to-bottom when
  // loadEarlier() prepends older messages (the newest message doesn't change).
  const lastScrolledIdRef = useRef<string | null>(null);

  // ── Emoji reactions ────────────────────────────────────────────────────────
  // message id → aggregated { emoji, count, mine } pills. Kept live by the
  // useReactionSync subscription below (other members' reactions arrive via
  // Realtime and trigger a per-message refetch).
  const [reactions, setReactions] = useState<ReactionsByMessage>(new Map());
  // Ids already queried, so the effect below only fetches newly visible
  // messages (initial page, loadEarlier pages, new realtime arrivals) and
  // never clobbers optimistic pill state with a refetch.
  const reactionsFetchedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch reactions whenever new message ids appear (extends the message-page
  // loads without touching useChannelThread). Empty map pre-migration.
  useEffect(() => {
    const missing = messages
      .map((m) => m.id)
      .filter((id) => !reactionsFetchedRef.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) reactionsFetchedRef.current.add(id);
    void fetchReactions(missing, myUserId).then((fetched) => {
      if (!mountedRef.current || fetched.size === 0) return;
      setReactions((prev) => {
        const next = new Map(prev);
        for (const [id, list] of fetched) next.set(id, list);
        return next;
      });
    });
  }, [messages, myUserId]);

  // Realtime: when anyone reacts to a visible message, refetch just that
  // message's pills (skipping ids with in-flight optimistic state is handled
  // by fetchReactions returning authoritative rows — server state wins).
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useReactionSync(
    channelId ?? null,
    useCallback(() => messagesRef.current.map((m) => m.id), []),
    useCallback(
      (messageId: string) => {
        void fetchReactions([messageId], myUserId).then((fetched) => {
          if (!mountedRef.current) return;
          setReactions((prev) => {
            const next = new Map(prev);
            next.set(messageId, fetched.get(messageId) ?? []);
            return next;
          });
        });
      },
      [myUserId],
    ),
  );

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!myUserId) return;
      Haptics.selectionAsync().catch(() => {});
      // Optimistic: flip the local pill now; toggleInMap is its own inverse,
      // so on server error we call it again to revert.
      setReactions((prev) => toggleInMap(prev, messageId, emoji));
      void toggleReaction(messageId, myUserId, emoji).then(({ error: err }) => {
        if (!err || !mountedRef.current) return;
        setReactions((prev) => toggleInMap(prev, messageId, emoji));
        Alert.alert('Reaction not saved', err);
      });
    },
    [myUserId],
  );

  // ── Delete / report (own vs. others' messages) ─────────────────────────────
  // Optimistic delete: the thread state lives in useChannelThread, so the
  // screen hides the bubble locally the moment the user confirms; the realtime
  // DELETE subscription removes it from the hook's state for real (and for
  // everyone else). On server error the id is un-hidden and the bubble returns.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const visibleMessages =
    hiddenIds.size === 0 ? messages : messages.filter((m) => !hiddenIds.has(m.id));

  const confirmDelete = useCallback((messageId: string) => {
    Alert.alert('Delete message?', 'This removes the message for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setHiddenIds((prev) => new Set(prev).add(messageId));
          void deleteMessage(messageId).then(({ error: err }) => {
            if (!err || !mountedRef.current) return;
            setHiddenIds((prev) => {
              const next = new Set(prev);
              next.delete(messageId);
              return next;
            });
            Alert.alert('Message not deleted', err);
          });
        },
      },
    ]);
  }, []);

  // Report another member's message (App Store 1.2) — same prompt pattern as
  // the mentorship thread (app/inbox/[requestId].tsx).
  const submitReport = useCallback(
    async (messageId: string, reason: string) => {
      if (!myUserId || !reason.trim()) return;
      const { error: reportError } = await reportContent({
        reporterId: myUserId,
        chapterId: profile?.chapter_id ?? null,
        targetType: 'channel_message',
        targetId: messageId,
        reason: reason.trim(),
      });
      if (reportError) Alert.alert('Couldn’t submit report', reportError);
      else Alert.alert('Report submitted', 'Thanks — our team will review it.');
    },
    [myUserId, profile?.chapter_id],
  );

  const startReport = useCallback(
    (messageId: string) => {
      if (Platform.OS === 'ios') {
        Alert.prompt(
          'Report message',
          'Tell us what’s wrong with this message.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Report',
              style: 'destructive',
              onPress: (reason?: string) =>
                void submitReport(messageId, reason || 'Reported from channel'),
            },
          ],
          'plain-text',
        );
      } else {
        // Android has no Alert.prompt — file with a fixed reason.
        void submitReport(messageId, 'Reported from channel');
      }
    },
    [submitReport],
  );

  // Long-press a bubble (or tap the '+' pill) → message sheet: quick-react
  // emoji plus delete (own messages, or any message for chapter admins) and
  // report (others' messages). Alert-only, matching the moderation menu
  // pattern in components/MessageActions.tsx.
  const openReactionSheet = useCallback(
    (message: ChannelMessage) => {
      if (!myUserId) return;
      const mine = message.sender_id === myUserId;
      Alert.alert('Message', undefined, [
        ...QUICK_EMOJI.map((emoji) => ({
          text: emoji,
          onPress: () => handleToggleReaction(message.id, emoji),
        })),
        ...(!mine
          ? [
              {
                text: 'Report message',
                style: 'destructive' as const,
                onPress: () => startReport(message.id),
              },
            ]
          : []),
        ...(mine
          ? [
              {
                text: 'Delete message',
                style: 'destructive' as const,
                onPress: () => confirmDelete(message.id),
              },
            ]
          : isAdmin(profile)
            ? [
                {
                  text: 'Delete message (admin)',
                  style: 'destructive' as const,
                  onPress: () => confirmDelete(message.id),
                },
              ]
            : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    },
    [myUserId, profile, handleToggleReaction, startReport, confirmDelete],
  );

  // Advance the "last read" marker (local + server, cross-device) whenever
  // the screen gains focus and as messages load / new realtime messages
  // arrive while it's open.
  useFocusEffect(
    useCallback(() => {
      if (channelId) void markChannelRead(channelId, myUserId ?? '');
    }, [channelId, myUserId]),
  );
  useEffect(() => {
    if (channelId && messages.length > 0) void markChannelRead(channelId, myUserId ?? '');
  }, [channelId, myUserId, messages.length]);

  async function handleSend() {
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    Haptics.selectionAsync().catch(() => {});
    await send(content);
  }

  function renderItem({ item, index }: { item: ChannelMessage; index: number }) {
    const mine = item.sender_id === myUserId;
    const prev = index > 0 ? visibleMessages[index - 1] : null;
    const showHeader = !prev || prev.sender_id !== item.sender_id;
    const sender = senders[item.sender_id];
    const messageReactions = reactions.get(item.id) ?? [];

    return (
      <View style={[styles.cluster, showHeader && styles.clusterSpaced]}>
        {showHeader && !mine && (
          <Pressable
            style={styles.senderRow}
            onPress={() =>
              sender && router.push({ pathname: '/profile/[id]', params: { id: sender.id } })
            }
          >
            <Avatar uri={sender?.avatar_url} name={sender?.name} size="xs" />
            <Text style={styles.senderName}>{sender?.name ?? 'Member'}</Text>
            {!!sender?.class_year && (
              <Text style={styles.gradYear}>’{String(sender.class_year).slice(-2)}</Text>
            )}
          </Pressable>
        )}
        <View style={[styles.bubbleRow, mine ? styles.alignRight : styles.alignLeft]}>
          <Pressable
            onLongPress={() => openReactionSheet(item)}
            style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
          >
            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
          </Pressable>
          <Text style={styles.bubbleTime}>{clockTime(item.created_at)}</Text>
        </View>
        {messageReactions.length > 0 && (
          <View style={[styles.reactionsRow, mine ? styles.alignRight : styles.alignLeft]}>
            <ReactionPills
              reactions={messageReactions}
              onToggle={(emoji) => handleToggleReaction(item.id, emoji)}
              onAdd={() => openReactionSheet(item)}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={channel ? `# ${channel.name}` : 'Channel'} onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <FlatList
            ref={listRef}
            data={visibleMessages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            // Keep the viewport anchored when loadEarlier() prepends history.
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onContentSizeChange={() => {
              // Only auto-scroll when a *new* newest message arrives — not when
              // loadEarlier() prepends history above the current scroll position.
              const newestId = visibleMessages[visibleMessages.length - 1]?.id ?? null;
              if (newestId && newestId !== lastScrolledIdRef.current) {
                lastScrolledIdRef.current = newestId;
                listRef.current?.scrollToEnd({ animated: true });
              }
            }}
            ListHeaderComponent={
              hasMore ? (
                <Pressable
                  onPress={loadEarlier}
                  disabled={loadingEarlier}
                  style={({ pressed }) => [styles.loadEarlier, pressed && styles.loadEarlierPressed]}
                >
                  {loadingEarlier ? (
                    <ActivityIndicator size="small" color={colors.gold} />
                  ) : (
                    <Text style={styles.loadEarlierText}>Load earlier messages</Text>
                  )}
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>
                  {error ? `Couldn’t load messages: ${error}` : 'Be the first to say something.'}
                </Text>
              </View>
            }
          />

          {typers.length > 0 && (
            <Text style={styles.typingLine} numberOfLines={1}>
              {typers.length === 1
                ? `${typers[0]} is typing…`
                : `${typers.length} people are typing…`}
            </Text>
          )}

          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                if (text.length > 0) signalTyping();
              }}
              placeholder={channel ? `Message #${channel.name}` : 'Message'}
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.gold}
              multiline
            />
            <Pressable
              onPress={handleSend}
              disabled={!draft.trim()}
              style={[styles.sendBtn, !draft.trim() && styles.sendDisabled]}
            >
              <Ionicons name="arrow-up" size={20} color={colors.background} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  list: { padding: spacing.lg, gap: spacing.xs, flexGrow: 1 },
  loadEarlier: { alignItems: 'center', paddingVertical: spacing.sm },
  loadEarlierPressed: { opacity: 0.6 },
  loadEarlierText: { ...typography.bodySmall, color: colors.gold, fontWeight: '600' },

  cluster: { gap: spacing.xs },
  clusterSpaced: { marginTop: spacing.md },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  senderName: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '600' },
  gradYear: { ...typography.caption, color: colors.textTertiary },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, maxWidth: '85%' },
  alignLeft: { alignSelf: 'flex-start' },
  alignRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.gold },
  bubbleTheirs: { backgroundColor: colors.surfaceElevated },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextMine: { color: colors.background },
  bubbleTime: { ...typography.caption, color: colors.textTertiary },
  reactionsRow: { maxWidth: '85%' },

  typingLine: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
