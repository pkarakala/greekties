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
import { useChannelThread } from '@/lib/chat';
import { markChannelRead } from '@/lib/reads';
import { fetchReactions, toggleReaction, QUICK_EMOJI } from '@/lib/reactions';
import type { ReactionsByMessage } from '@/lib/reactions';
import { clockTime } from '@/lib/time';
import { Avatar } from '@/components/Avatar';
import { ReactionPills } from '@/components/ReactionPills';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, radius, spacing, typography } from '@/theme';
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
  const { session } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const { loading, error, channel, messages, senders, hasMore, loadingEarlier, loadEarlier, send } =
    useChannelThread(channelId ?? null, myUserId);

  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChannelMessage>>(null);
  // Last message id we auto-scrolled to — lets us skip the scroll-to-bottom when
  // loadEarlier() prepends older messages (the newest message doesn't change).
  const lastScrolledIdRef = useRef<string | null>(null);

  // ── Emoji reactions ────────────────────────────────────────────────────────
  // message id → aggregated { emoji, count, mine } pills. KNOWN LIMITATION:
  // no realtime subscription for reactions in this round — other members'
  // reactions only appear when a message's page is (re)fetched, i.e. on
  // screen re-entry. Realtime parity is a follow-up.
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

  // Long-press a bubble (or tap the '+' pill) → quick-react sheet. Alert-only,
  // matching the moderation menu pattern in components/MessageActions.tsx.
  const openReactionSheet = useCallback(
    (messageId: string) => {
      if (!myUserId) return;
      Alert.alert('React to message', undefined, [
        ...QUICK_EMOJI.map((emoji) => ({
          text: emoji,
          onPress: () => handleToggleReaction(messageId, emoji),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    },
    [myUserId, handleToggleReaction],
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
    const prev = index > 0 ? messages[index - 1] : null;
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
            onLongPress={() => openReactionSheet(item.id)}
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
              onAdd={() => openReactionSheet(item.id)}
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
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            // Keep the viewport anchored when loadEarlier() prepends history.
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onContentSizeChange={() => {
              // Only auto-scroll when a *new* newest message arrives — not when
              // loadEarlier() prepends history above the current scroll position.
              const newestId = messages[messages.length - 1]?.id ?? null;
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

          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
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
