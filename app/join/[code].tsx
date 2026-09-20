import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import {
  clearPendingInvite,
  joinChapterWithInvite,
  resolveChapterInvite,
  storePendingInviteCode,
  type InviteResolution,
} from '@/lib/invite';
import { parseInviteCode } from '@/lib/links';
import type { PendingInvite } from '@/lib/pending-invite';
import { Wordmark } from '@/components/Wordmark';
import { Button } from '@/components/Button';
import { SUPPORT_EMAIL } from '@/lib/legal';
import { colors, radius, spacing, typography } from '@/theme';

export default function JoinScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  // A changed deep link cannot briefly render or act on the previous preview.
  return <InviteFlow key={params.code} input={params.code} />;
}

function InviteFlow({ input }: { input: string }) {
  const code = parseInviteCode(input);
  const router = useRouter();
  const {
    initializing,
    session,
    profile,
    profileState,
    authError,
    refreshProfile,
    retrySession,
    signOut,
  } = useAuth();
  const [resolution, setResolution] = useState<InviteResolution | null>(null);
  const [saved, setSaved] = useState<PendingInvite | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const attempt = useRef(0);
  const pendingSave = useRef<ReturnType<typeof storePendingInviteCode> | null>(null);
  const cancelStarted = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentUser = useRef(session?.user.id);
  useEffect(() => {
    currentUser.current = session?.user.id;
  }, [session?.user.id]);

  useEffect(() => {
    const version = ++attempt.current;
    // Reset display state when synchronizing a new external invitation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolution(null);
    setSaved(null);
    setError(null);
    setJoining(false);
    if (!code) {
      setResolution({ kind: 'invalid' });
      return;
    }
    void (async () => {
      // Save as soon as the link opens, even if preview/auth is offline.
      const save = storePendingInviteCode(code);
      pendingSave.current = save;
      const stored = await save;
      if (version !== attempt.current) return;
      setSaved(stored.invite);
      setWarning(stored.warning);
      const next = await resolveChapterInvite(code);
      if (version === attempt.current) setResolution(next);
    })();
    return () => {
      attempt.current = version + 1;
    };
  }, [code, retry]);

  async function leave() {
    if (cancelStarted.current) return;
    cancelStarted.current = true;
    const version = ++attempt.current;
    setCanceling(true);
    // Cleanup is independent of React state and must finish even after
    // unmount. The store compares revisions before removing anything.
    const stored = await pendingSave.current;
    const result = stored ? await clearPendingInvite(stored.invite) : null;
    if (!mounted.current || version !== attempt.current) return;
    pendingSave.current = null;
    setSaved(null);
    setCanceling(false);
    cancelStarted.current = false;
    if (result) {
      if (!result.cleared) {
        setError('Another invitation is now saved. Open it from membership help.');
        return;
      }
      if (result.warning) {
        setWarning(result.warning);
        setJoining(false);
        return;
      }
    }
    router.replace(session ? '/membership' : '/login');
  }

  async function handleJoin() {
    if (!code || !saved || resolution?.kind !== 'valid' || joining || cancelStarted.current) return;
    if (!session) {
      router.replace({ pathname: '/signup', params: { code } });
      return;
    }
    const version = attempt.current;
    const userId = session.user.id;
    setJoining(true);
    setError(null);
    // Already-approved membership is an idempotent success even before V9.
    const alreadyJoined =
      profile?.status === 'approved' && profile.chapter_id === resolution.chapter.id;
    const result = alreadyJoined ? { error: null } : await joinChapterWithInvite(code);
    if (version !== attempt.current || currentUser.current !== userId) return;
    if (result.error) {
      setJoining(false);
      setError(result.error);
      return;
    }
    const cleared = await clearPendingInvite(saved);
    if (version !== attempt.current || currentUser.current !== userId) return;
    if (!cleared.cleared) {
      setJoining(false);
      setError(
        'Membership saved. Another invitation is now active; review it from membership help.',
      );
      return;
    }
    if (!alreadyJoined) await refreshProfile();
    if (version !== attempt.current || currentUser.current !== userId) return;
    setJoining(false);
    if (cleared.warning) {
      setWarning(cleared.warning);
      setError('Membership saved. You can continue to your chapter.');
      return;
    }
    router.replace(alreadyJoined ? '/' : '/onboarding/complete-profile');
  }

  const chapter = resolution?.kind === 'valid' ? resolution.chapter : null;
  const checking = initializing || !resolution || (!!session && profileState === 'loading');
  const profileError = !!authError || (!!session && profileState === 'error');
  const wrongChapter = !!profile?.chapter_id && !!chapter && profile.chapter_id !== chapter.id;
  const removed = profile?.status === 'rejected';
  const pending = profile?.status === 'pending';
  const approved = profile?.status === 'approved' && profile.chapter_id === chapter?.id;
  const unknownProfile =
    !!profile && (!profile.chapter_id || (!removed && !pending && profile.status !== 'approved'));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Wordmark size={28} />
        {chapter && (
          <View style={styles.card}>
            <Text style={styles.invitedTo}>You’re invited to join</Text>
            <Text style={styles.chapterName}>{chapter.name}</Text>
            {!!chapter.designation && <Text style={styles.university}>{chapter.designation}</Text>}
            {!!chapter.university && <Text style={styles.university}>{chapter.university}</Text>}
          </View>
        )}
        {checking && <ActivityIndicator color={colors.gold} />}
        {!!warning && (
          <Text style={styles.invalid} accessibilityRole="alert">
            {warning}
          </Text>
        )}
        {!!error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {resolution?.kind === 'invalid' && (
          <Text style={styles.invalid}>
            This invitation is invalid, revoked, or expired. Ask your chapter for a current link, or
            paste another invitation.
          </Text>
        )}
        {resolution?.kind === 'error' && (
          <>
            <Text style={styles.invalid}>
              We couldn’t check this invitation right now. It is saved for retry.
            </Text>
            <Button label="Retry invitation" onPress={() => setRetry((n) => n + 1)} />
          </>
        )}
        {(profileError || unknownProfile) && (
          <>
            <Text style={styles.invalid}>
              We couldn’t check your membership. Try again before joining.
            </Text>
            <Button
              label="Retry membership check"
              onPress={() => void (authError ? retrySession() : refreshProfile())}
            />
          </>
        )}
        {wrongChapter && (
          <Text style={styles.invalid}>
            This invitation is for a different chapter. Your account already belongs to another
            chapter, including any pending or removed membership. Each account can join only one
            chapter. Sign out to use the intended account, or contact your chapter admin.
          </Text>
        )}
        {removed && (
          <Text style={styles.invalid}>
            Your chapter access was removed or declined. A chapter admin must reinstate you. A
            shared invitation cannot restore access.
          </Text>
        )}
        {pending && (
          <Text style={styles.invalid}>
            Your membership is awaiting chapter admin approval. An invitation cannot bypass this
            review.
          </Text>
        )}
        {!checking &&
          !profileError &&
          !unknownProfile &&
          chapter &&
          !wrongChapter &&
          !removed &&
          !pending && (
            <Button
              label={
                approved ? 'Continue to chapter' : session ? 'Join chapter' : 'Sign up to join'
              }
              onPress={handleJoin}
              loading={joining}
              disabled={!saved || canceling}
            />
          )}
        {!session && code && (
          <Button
            label="Already have an account? Log in"
            variant="secondary"
            onPress={() => router.replace({ pathname: '/login', params: { code } })}
          />
        )}
        <Button
          label="Paste another invitation"
          variant="secondary"
          onPress={() => router.push('/onboarding/enter-code')}
          disabled={joining || canceling}
        />
        <Button
          label="Cancel invitation"
          variant="ghost"
          onPress={leave}
          disabled={joining}
          loading={canceling}
        />
        {session && (
          <Button
            label="Membership and account help"
            variant="secondary"
            onPress={() => router.push('/membership')}
          />
        )}
        {session && (
          <Button
            label="Sign out"
            variant="ghost"
            onPress={async () => {
              try {
                await signOut();
              } catch {
                setError('Couldn’t sign out. Please try again.');
              }
            }}
          />
        )}
        <Text selectable style={styles.invalid}>
          For help, contact your chapter admin or {SUPPORT_EMAIL}.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  content: {
    flexGrow: 1,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  invitedTo: {
    ...typography.heroLabel,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chapterName: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  university: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  invalid: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  error: { ...typography.bodySmall, color: colors.red, textAlign: 'center' },
});
