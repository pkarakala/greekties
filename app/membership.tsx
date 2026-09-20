import { useEffect, useState } from 'react';
import { Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { membershipState } from '@/lib/entry';
import { readPendingInvite, clearPendingInvite } from '@/lib/invite';
import type { PendingInvite } from '@/lib/pending-invite';
import { Button } from '@/components/Button';
import { Wordmark } from '@/components/Wordmark';
import { SUPPORT_EMAIL } from '@/lib/legal';
import { colors, spacing, typography } from '@/theme';

export default function MembershipScreen() {
  const auth = useAuth();
  const router = useRouter();
  const state = membershipState(
    auth.initializing,
    !!auth.session,
    auth.profileState,
    auth.profile,
    auth.authError,
  );
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void readPendingInvite().then((result) => {
      if (active) {
        setInvite(result.invite);
        setNotice(result.warning);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const message = {
    loading: 'Checking your membership…',
    error: 'We couldn’t check your membership. Your invitation is still available. Please retry.',
    'signed-out': 'Log in to continue to your chapter.',
    missing: 'Join your chapter using the invitation your chapter shared with you.',
    pending:
      'Your chapter membership is awaiting admin approval. An invitation cannot bypass this review.',
    removed:
      'Your chapter access was removed or your request was declined. A chapter admin must explicitly reinstate you; an invitation cannot restore access.',
    approved: 'Your chapter membership is active.',
  }[state];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: spacing.xl,
          gap: spacing.lg,
        }}
      >
        <Wordmark size={28} />
        <Text style={{ ...typography.body, color: colors.textPrimary }}>
          {auth.authError ?? message}
        </Text>
        {state === 'loading' && <ActivityIndicator color={colors.gold} />}
        {!!notice && <Text accessibilityRole="alert">{notice}</Text>}
        {state === 'approved' && (
          <Button label="Continue to chapter" onPress={() => router.replace('/')} />
        )}
        {(state === 'missing' ||
          state === 'pending' ||
          state === 'removed' ||
          state === 'error') && (
          <Button
            label="Check again"
            onPress={() => void (auth.authError ? auth.retrySession() : auth.refreshProfile())}
          />
        )}
        {invite && (
          <>
            <Button
              label="Resume invitation"
              onPress={() =>
                router.push({ pathname: '/join/[code]', params: { code: invite.code } })
              }
            />
            <Button
              label="Cancel saved invitation"
              variant="secondary"
              onPress={async () => {
                const result = await clearPendingInvite(invite);
                setNotice(result.warning);
                setInvite((await readPendingInvite()).invite);
              }}
            />
          </>
        )}
        <Button
          label="Paste an invitation link or code"
          variant="secondary"
          onPress={() => router.push('/onboarding/enter-code')}
        />
        <Text style={{ ...typography.bodySmall, color: colors.textSecondary }}>
          Installed the app after opening a link in your browser? Reopen that original link or paste
          it here. Invitations do not transfer between browser and app.
        </Text>
        <Text selectable style={{ ...typography.bodySmall, color: colors.textSecondary }}>
          Contact your chapter admin for membership help, or {SUPPORT_EMAIL}.
        </Text>
        <Button
          label="Reset password"
          variant="ghost"
          onPress={() => router.push('/forgot-password')}
        />
        {auth.session || auth.authError ? (
          <Button
            label="Sign out"
            variant="secondary"
            onPress={async () => {
              try {
                await auth.signOut();
                router.replace('/login');
              } catch {
                setNotice('Couldn’t sign out. Check your connection and try again.');
              }
            }}
          />
        ) : (
          <Button label="Log in" onPress={() => router.replace('/login')} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
