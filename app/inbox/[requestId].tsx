import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useThread, respondToRequest } from '@/lib/mentorship';
import { reportContent, blockUser } from '@/lib/moderation';
import { Ionicons } from '@expo/vector-icons';
import {
  CompactMessage,
  ConversationHeader,
  ConversationList,
  conversationStyles,
} from '@/components/CompactConversation';
import { MessageComposer } from '@/components/MessageComposer';
import { Button } from '@/components/Button';
import { showMessageActions } from '@/components/MessageActions';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/chats';

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

  const context = request ? (
    <View style={styles.context}>
      {!!request.message && (
        <View style={styles.requestNote}>
          <Text style={styles.requestLabel}>Mentorship request</Text>
          <Text style={styles.requestMsg}>{request.message}</Text>
        </View>
      )}
      {isRecipient && request.status === 'pending' && (
        <View style={styles.actions}>
          <Button
            tone="home"
            label="Accept"
            onPress={() => respond('accepted')}
            loading={responding}
          />
          <Button
            tone="home"
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
    </View>
  ) : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ConversationHeader
        title={request ? (other?.name ?? 'Member') : 'Conversation'}
        subtitle={accepted ? 'Mentorship conversation' : 'Mentorship request'}
        onBack={() => router.back()}
        onRefresh={request ? reload : undefined}
        refreshing={loading}
        onProfile={
          request && other?.id
            ? () => router.push({ pathname: '/profile/[id]', params: { id: other.id } })
            : undefined
        }
      />
      {accepted && (
        <View style={styles.accepted}>
          <Ionicons name="checkmark-circle-outline" size={17} color={colors.blue} />
          <Text style={styles.acceptedText}>
            Mentorship accepted
            {request.focus_areas?.length ? ` · ${request.focus_areas.join(', ')}` : ''}
          </Text>
        </View>
      )}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : !request ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error ?? 'This request couldn’t be found.'}</Text>
          <Button tone="home" label="Reload conversation" onPress={reload} variant="secondary" />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ConversationList
            key={JSON.stringify([requestId, myUserId])}
            messages={accepted ? messages : []}
            onRefresh={reload}
            refreshing={loading}
            header={context}
            empty={
              accepted ? <Text style={styles.statusNote}>You’re connected. Say hello.</Text> : null
            }
            renderItem={({ item, index }) => {
              const mine = item.sender_id === myUserId;
              const actor = mine ? profile : other;
              return (
                <CompactMessage
                  message={item}
                  previous={messages[index - 1]}
                  mine={mine}
                  name={actor?.name ?? (mine ? 'You' : 'Member')}
                  avatar={actor?.avatar_url}
                  onProfile={
                    actor?.id
                      ? () => router.push({ pathname: '/profile/[id]', params: { id: actor.id } })
                      : undefined
                  }
                  onActions={
                    mine
                      ? undefined
                      : () =>
                          showMessageActions({
                            senderName: other?.name ?? 'Member',
                            onReport: () => startReport(item.id),
                            onBlock: () => confirmBlock(item.sender_id),
                          })
                  }
                >
                  <Text style={[conversationStyles.text, mine && conversationStyles.ownText]}>
                    {item.content}
                  </Text>
                </CompactMessage>
              );
            }}
          />
          {!!error && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reload messages"
              onPress={reload}
              style={styles.reload}
            >
              <Text style={styles.muted}>{error} Tap to reload.</Text>
            </Pressable>
          )}
          {accepted && (
            <MessageComposer
              composer={composer}
              placeholder={`Message ${other?.name ?? 'member'}`}
            />
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  muted: { ...typography.body, color: colors.textSecondary },
  context: { gap: spacing.sm },
  requestNote: {
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.goldLight,
    paddingHorizontal: 12,
  },
  requestLabel: { ...typography.caption, color: colors.textSecondary },
  requestMsg: { ...typography.bodySmall, color: colors.textSecondary },
  accepted: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gold,
    backgroundColor: colors.gold,
  },
  acceptedText: { ...typography.caption, color: colors.navy, flex: 1 },
  actions: { gap: spacing.sm, paddingVertical: spacing.md },
  statusNote: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  reload: { minHeight: 48, justifyContent: 'center', padding: spacing.md },
});
