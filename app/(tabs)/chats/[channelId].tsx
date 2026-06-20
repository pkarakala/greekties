import { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { useChannelThread } from '@/lib/chat';
import { markRead } from '@/lib/reads';
import { clockTime } from '@/lib/time';
import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, radius, spacing, typography } from '@/theme';
import type { ChannelMessage } from '@/lib/types';

export default function ChannelThreadScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const { loading, error, channel, messages, senders, send } = useChannelThread(
    channelId ?? null,
    myUserId,
  );

  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChannelMessage>>(null);

  // Advance the local "last read" marker as messages load/arrive.
  useEffect(() => {
    if (channelId && messages.length > 0) markRead(channelId);
  }, [channelId, messages.length]);

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
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
          </View>
          <Text style={styles.bubbleTime}>{clockTime(item.created_at)}</Text>
        </View>
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
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
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
