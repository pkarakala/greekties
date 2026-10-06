import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useThread, respondToRequest } from '@/lib/mentorship';
import { reportContent, blockUser } from '@/lib/moderation';
import { ScreenHeader } from '@/components/ScreenHeader';
import { MessageComposer } from '@/components/MessageComposer';
import { Button } from '@/components/Button';
import { showMessageActions } from '@/components/MessageActions';
import { colors, radius, spacing, typography } from '@/theme';

export default function ThreadScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const { session, profile, blockedIds } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const { loading, error, request, messages, other, reload, composer } = useThread(
    requestId ?? null,
    myUserId,
    blockedIds,
  );

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

  // ── Moderation (long-press another member's bubble) ────────────────────────

  async function submitReport(messageId: string, reason: string) {
    if (!myUserId || !reason.trim()) return;
    const { error: reportError } = await reportContent({
      reporterId: myUserId,
      chapterId: profile?.chapter_id ?? null,
      targetType: 'mentorship_message',
      targetId: messageId,
      reason: reason.trim(),
    });
    if (reportError) Alert.alert('Couldn’t submit report', reportError);
    else Alert.alert('Report submitted', 'Thanks — our team will review it.');
  }

  function startReport(messageId: string) {
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
              void submitReport(messageId, reason || 'Reported from thread'),
          },
        ],
        'plain-text',
      );
    } else {
      // Android has no Alert.prompt — file with a fixed reason.
      void submitReport(messageId, 'Reported from thread');
    }
  }

  function confirmBlock(blockedUserId: string) {
    if (!myUserId) return;
    Alert.alert(
      `Block ${other?.name ?? 'this member'}?`,
      'You won’t see their profile or messages anymore.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const { error: blockError } = await blockUser(myUserId, blockedUserId);
            if (blockError) Alert.alert('Couldn’t block', blockError);
            else router.back();
          },
        },
      ],
    );
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
          <Button label="Reload conversation" onPress={reload} variant="secondary" />
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

            {/* Conversation (once accepted). Long-press another member's bubble
                to report the message or block them (own bubbles are inert). */}
            {accepted &&
              messages.map((m) => {
                const mine = m.sender_id === myUserId;
                if (mine) {
                  return (
                    <View key={m.id} style={[styles.bubble, styles.bubbleMine]}>
                      <Text style={[styles.bubbleText, styles.bubbleTextMine]}>{m.content}</Text>
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.bubble, styles.bubbleTheirs]}
                    onLongPress={() =>
                      showMessageActions({
                        senderName: other?.name ?? 'Member',
                        onReport: () => startReport(m.id),
                        onBlock: () => confirmBlock(m.sender_id),
                      })
                    }
                  >
                    <Text style={styles.bubbleText}>{m.content}</Text>
                  </Pressable>
                );
              })}

            {accepted && messages.length === 0 && (
              <Text style={styles.statusNote}>You’re connected. Say hello 👋</Text>
            )}
          </ScrollView>

          {!!error && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reload messages"
              onPress={reload}
            >
              <Text style={styles.muted}>{error} Tap to reload.</Text>
            </Pressable>
          )}
          {accepted && <MessageComposer composer={composer} />}
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
});
