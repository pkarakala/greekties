import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import {
  getChatShare,
  appendChatShare,
  cancelChatShare,
  pauseChatShareValidation,
  type ChatShare,
} from '@/lib/chat-share';
import type { RecoveryEntry } from '@/lib/message-recovery';
import { Button } from './Button';
import { colors, spacing } from '@/theme';

export function ChatShareReview({
  entry,
  shareId,
}: {
  entry: RecoveryEntry | null;
  shareId?: string;
}) {
  const share = getChatShare(entry, shareId);
  return share ? <Review key={share.id} share={share} /> : null;
}
function Review({ share }: { share: ChatShare }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  const generation = useRef(0);
  const validation = useRef<(() => boolean) | null>(null);
  const pause = useCallback(() => {
    live.current = false;
    generation.current++;
    if (validation.current) pauseChatShareValidation(share, validation.current);
  }, [share]);
  useEffect(() => {
    live.current = true;
    return pause;
  }, [pause]);
  useFocusEffect(
    useCallback(() => {
      live.current = true;
      setBusy(false);
      return pause;
    }, [pause]),
  );
  async function append() {
    if (!live.current || share.state !== 'ready') return;
    const run = ++generation.current;
    const current = () => live.current && generation.current === run;
    validation.current = current;
    setBusy(true);
    setError(null);
    try {
      const added = await appendChatShare(share, current);
      if (current() && added) setDone(true);
    } catch {
      if (current()) setError('Couldn’t verify this item and channel. Retry or cancel.');
    } finally {
      if (current()) setBusy(false);
    }
  }
  if (done) return null;
  return (
    <View
      style={{
        padding: spacing.lg,
        gap: spacing.sm,
        borderTopWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.textPrimary }}>{share.text}</Text>
      <Text style={{ color: colors.textSecondary }}>
        Add this to your draft, review it, then press Send.
        {share.entry.state.attempt ? ' Your pending or failed message stays separate.' : ''}
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.red }}>
          {error}
        </Text>
      )}
      <Button
        label={share.entry.state.draft ? 'Append to current draft' : 'Add to draft'}
        onPress={append}
        loading={busy}
      />
      <Button
        label="Cancel share"
        variant="ghost"
        onPress={() => {
          live.current = false;
          cancelChatShare(share);
          setDone(true);
        }}
      />
    </View>
  );
}
