import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  readPendingInvite,
  resolveChapterInvite,
  storePendingInviteCode,
  type ChapterInvitePreview,
} from '@/lib/invite';
import { parseInviteCode } from '@/lib/links';
import { Button } from './Button';
import { colors, spacing, typography } from '@/theme';

/** Display identity throughout auth, including a restored confirmation visit. */
export function InvitationContext({ code }: { code?: string }) {
  const router = useRouter();
  const [chapter, setChapter] = useState<ChapterInvitePreview | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const normalized = parseInviteCode(code);
      const result = normalized
        ? await storePendingInviteCode(normalized)
        : await readPendingInvite();
      if (!active) return;
      setWarning(result.warning);
      setPendingCode(result.invite?.code ?? null);
      if (result.invite) {
        const preview = await resolveChapterInvite(result.invite.code);
        if (active) setChapter(preview.kind === 'valid' ? preview.chapter : null);
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
      {chapter && (
        <Text style={{ ...typography.body, color: colors.textPrimary, textAlign: 'center' }}>
          {[chapter.name, chapter.designation, chapter.university].filter(Boolean).join(' · ')}
        </Text>
      )}
      {!!warning && <Text accessibilityRole="alert">{warning}</Text>}
      <Button
        label={pendingCode ? 'Review saved invitation' : 'Have an invitation? Paste link or code'}
        variant="ghost"
        onPress={() => {
          if (pendingCode) router.push({ pathname: '/join/[code]', params: { code: pendingCode } });
          else router.push('/onboarding/enter-code');
        }}
      />
    </View>
  );
}
