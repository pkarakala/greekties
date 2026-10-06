import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  recoveryIsCurrent,
  type RecoveryEntry,
  type SendAttempt,
  type useMessageRecovery,
} from '@/lib/message-recovery';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  composer: ReturnType<typeof useMessageRecovery>;
  placeholder?: string;
};

/** Each settled attempt snapshot gets a fresh confirmation. In addition to the
 * store's identity guard, event handlers check the snapshot and mount lifetime.
 * Retry replaces the snapshot even when the logical message ID stays the same.
 * Old confirmations cannot act after cancel, retry, settlement, or navigation.
 */
function RecoveryActions({
  composer,
  entry,
  attempt,
}: {
  composer: Props['composer'];
  entry: RecoveryEntry;
  attempt: SendAttempt;
}) {
  const [confirmation, setConfirmation] = useState<SendAttempt | null>(null);
  const confirmationOpen = useRef<SendAttempt | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      confirmationOpen.current = null;
    };
  }, []);
  const current = () =>
    mounted.current &&
    recoveryIsCurrent(entry) &&
    entry.state.attempt === attempt &&
    entry.state.attempt.status !== 'pending';

  if (confirmation === attempt)
    return (
      <View style={styles.confirmation}>
        <Text accessibilityRole="header" style={styles.retryText}>
          Discard saved message?
        </Text>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.warning}>
          This removes only the saved attempt from this device. It does not delete a message that
          may already have been sent or cancel a send already in progress.
        </Text>
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel discard saved message"
            style={styles.retry}
            onPress={() => {
              if (confirmationOpen.current !== attempt || !current()) return;
              confirmationOpen.current = null;
              setConfirmation(null);
            }}
          >
            <Text style={styles.retryText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm discard saved message"
            style={styles.retry}
            onPress={() => {
              if (confirmationOpen.current !== attempt || !current()) return;
              confirmationOpen.current = null;
              setConfirmation(null);
              composer.discard();
            }}
          >
            <Text style={styles.retryText}>Discard</Text>
          </Pressable>
        </View>
      </View>
    );
  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry message"
        onPress={() => {
          if (current()) void composer.retry();
        }}
        style={styles.retry}
      >
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Discard saved message"
        style={styles.retry}
        onPress={() => {
          if (!current()) return;
          confirmationOpen.current = attempt;
          setConfirmation(attempt);
        }}
      >
        <Text style={styles.retryText}>Discard</Text>
      </Pressable>
    </View>
  );
}

export function MessageComposer({ composer, placeholder = 'Message' }: Props) {
  const { draft, setDraft, attempt, send, error, entry } = composer;
  const disabled = !draft.trim() || !!attempt;
  return (
    <View>
      {attempt && (
        <View style={styles.recovery}>
          <ScrollView style={styles.savedPreview}>
            <Text selectable style={styles.savedText}>
              {attempt.content}
            </Text>
          </ScrollView>
          <View style={styles.statusRow}>
            {attempt.status === 'pending' && <ActivityIndicator color={colors.navy} size="small" />}
            <Text accessibilityLiveRegion="polite" style={styles.status}>
              {attempt.status === 'pending'
                ? 'Sending… Your message is kept here until confirmed.'
                : attempt.status === 'uncertain'
                  ? 'Send not confirmed. Your message is kept here. Retry will check before sending again.'
                  : 'Couldn’t send. Your message is kept here.'}
            </Text>
          </View>
          {attempt.status !== 'pending' && entry && (
            <RecoveryActions
              key={JSON.stringify([entry.userId, entry.kind, entry.conversationId, attempt.id])}
              composer={composer}
              entry={entry}
              attempt={attempt}
            />
          )}
        </View>
      )}
      {!!error && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message draft"
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.gold}
          multiline
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled }}
          onPress={() => void send()}
          disabled={disabled}
          style={[styles.sendBtn, disabled && styles.sendDisabled]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.background} />
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  recovery: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  savedPreview: { maxHeight: 120 },
  savedText: { ...typography.body, color: colors.textPrimary },
  confirmation: { gap: spacing.sm },
  warning: { ...typography.bodySmall, color: colors.textSecondary },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  status: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
  },
  retryText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  error: { ...typography.bodySmall, color: colors.textSecondary, paddingHorizontal: spacing.lg },
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
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
