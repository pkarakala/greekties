import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useThread, respondToRequest, sendMessage } from '@/lib/mentorship';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';

export default function ThreadScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const { loading, error, request, messages, other, reload } = useThread(
    requestId ?? null,
    myUserId,
  );

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [responding, setResponding] = useState(false);

  const isRecipient = !!request && request.to_user_id === myUserId;
  const accepted = request?.status === 'accepted';

  async function respond(status: 'accepted' | 'declined') {
    if (!request) return;
    setResponding(true);
    const err = await respondToRequest(request.id, status);
    setResponding(false);
    if (!err) reload();
  }

  async function send() {
    if (!draft.trim() || !request || !myUserId) return;
    const content = draft.trim();
    setDraft('');
    setSending(true);
    const err = await sendMessage(request.id, myUserId, content);
    setSending(false);
    if (err) setDraft(content);
    else reload();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={other?.name ?? 'Conversation'} onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !request ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error ?? 'This request couldn’t be found.'}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
            }
          >
            {/* Original request */}
            {!!request.message && (
              <View style={styles.requestCard}>
                <Text style={styles.requestLabel}>Mentorship request</Text>
                <Text style={styles.requestMsg}>{request.message}</Text>
              </View>
            )}

            {/* Recipient action on a pending request */}
            {isRecipient && request.status === 'pending' && (
              <View style={styles.actions}>
                <Button label="Accept" onPress={() => respond('accepted')} loading={responding} />
                <Button
                  label="Decline"
                  variant="secondary"
                  onPress={() => respond('declined')}
                  loading={responding}
                />
              </View>
            )}

            {!isRecipient && request.status === 'pending' && (
              <Text style={styles.statusNote}>Waiting for a response…</Text>
            )}
            {request.status === 'declined' && (
              <Text style={styles.statusNote}>This request was declined.</Text>
            )}

            {/* Conversation (once accepted) */}
            {accepted &&
              messages.map((m) => {
                const mine = m.sender_id === myUserId;
                return (
                  <View
                    key={m.id}
                    style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                  >
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                      {m.content}
                    </Text>
                  </View>
                );
              })}

            {accepted && messages.length === 0 && (
              <Text style={styles.statusNote}>You’re connected. Say hello 👋</Text>
            )}
          </ScrollView>

          {/* Composer — only when accepted */}
          {accepted && (
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Message"
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.gold}
                multiline
              />
              <Pressable
                onPress={send}
                disabled={!draft.trim() || sending}
                style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendDisabled]}
              >
                <Ionicons name="arrow-up" size={20} color={colors.background} />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.body, color: colors.textSecondary },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },

  requestCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  requestLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requestMsg: { ...typography.body, color: colors.textPrimary },

  actions: { gap: spacing.sm },
  statusNote: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.gold },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceElevated },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextMine: { color: colors.background },

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
