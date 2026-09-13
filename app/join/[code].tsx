import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import {
  consumePendingInviteCode,
  joinChapterWithInvite,
  resolveChapterInvite,
  storePendingInviteCode,
  type ChapterInvitePreview,
} from '@/lib/invite';
import { Wordmark } from '@/components/Wordmark';
import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { initializing, session, profile, refreshProfile } = useAuth();

  const [loadingChapter, setLoadingChapter] = useState(true);
  const [chapter, setChapter] = useState<ChapterInvitePreview | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a join succeeds so the "already a member → Home" effect below
  // can't stomp the redirect to /onboarding/complete-profile when the
  // refreshed profile lands while this screen is still mounted.
  const justJoined = useRef(false);

  useEffect(() => {
    let mounted = true;
    if (!code) {
      setLoadingChapter(false);
      return;
    }
    resolveChapterInvite(code).then((c) => {
      if (!mounted) return;
      setChapter(c);
      setLoadingChapter(false);
    });
    return () => {
      mounted = false;
    };
  }, [code]);

  // Already a member of this chapter → straight to Home. (Skipped right
  // after a successful join — that flow routes to profile setup instead.)
  useEffect(() => {
    if (justJoined.current) return;
    if (profile?.status === 'approved' && chapter && profile.chapter_id === chapter.id) {
      router.replace('/');
    }
  }, [profile, chapter, router]);

  const handleJoin = useCallback(async () => {
    if (!chapter || joining) return;

    // Must be signed in to attach a profile. Send to signup, carrying the code
    // both as a param and in secure storage (survives email confirmation).
    if (!session?.user) {
      await storePendingInviteCode(code!);
      router.replace({ pathname: '/signup', params: { code } });
      return;
    }

    setError(null);
    setJoining(true);

    // The RPC checks the code, enforces one-chapter-per-account, and creates
    // the profile server-side. If it is unavailable, this path fails closed.
    const { error: joinError } = await joinChapterWithInvite(code!);

    if (!joinError) {
      justJoined.current = true;
      await consumePendingInviteCode(); // clear any stored copy of this code
      await refreshProfile();
      setJoining(false);
      // Fresh member → capture the profile basics while they're engaged.
      router.replace('/onboarding/complete-profile');
      return;
    }

    setJoining(false);
    setError(joinError);
  }, [chapter, joining, session, code, router, refreshProfile]);

  if (initializing || loadingChapter) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  if (!chapter) {
    return (
      <SafeAreaView style={styles.center}>
        <Wordmark size={28} />
        <Text style={styles.invalid}>This invite link isn’t valid.</Text>
        <Button
          label={session ? 'Go home' : 'Go to login'}
          variant="secondary"
          fullWidth={false}
          onPress={() => router.replace(session ? '/' : '/login')}
        />
      </SafeAreaView>
    );
  }

  // Signed in but already in a different chapter → clear message, no join.
  if (profile?.status === 'approved' && profile.chapter_id !== chapter.id) {
    return (
      <SafeAreaView style={styles.center}>
        <Wordmark size={28} />
        <Text style={styles.invalid}>
          You’re already a member of another chapter. Each account can only
          join one chapter.
        </Text>
        <Button
          label="Go home"
          variant="secondary"
          fullWidth={false}
          onPress={() => router.replace('/')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Wordmark size={28} />

        <View style={styles.card}>
          <Text style={styles.invitedTo}>You’re invited to join</Text>
          <Text style={styles.chapterName}>{chapter.designation ?? chapter.name}</Text>
          {!!chapter.university && (
            <Text style={styles.university}>{chapter.university}</Text>
          )}
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Button
          label={session?.user ? 'Join instantly' : 'Sign up to join'}
          onPress={handleJoin}
          loading={joining}
        />
      </View>
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
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
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
