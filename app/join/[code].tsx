import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Wordmark } from '@/components/Wordmark';
import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';
import type { Chapter } from '@/lib/types';

// Resolve the invite code to a chapter. The shared schema (DATABASE.md) does not
// document a dedicated invite-code column, so we try `invite_code` first and fall
// back to treating the code as the chapter id. If the live website uses a different
// column for invite links, change the lookup here.
async function resolveChapter(code: string): Promise<Chapter | null> {
  const byCode = await supabase
    .from('chapters')
    .select('*')
    .eq('invite_code', code)
    .maybeSingle();

  if (!byCode.error && byCode.data) return byCode.data as Chapter;

  // `invite_code` column missing (42703) or no match → try the id.
  const byId = await supabase
    .from('chapters')
    .select('*')
    .eq('id', code)
    .maybeSingle();

  if (!byId.error && byId.data) return byId.data as Chapter;
  return null;
}

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { initializing, session, profile, refreshProfile } = useAuth();

  const [loadingChapter, setLoadingChapter] = useState(true);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!code) {
      setLoadingChapter(false);
      return;
    }
    resolveChapter(code).then((c) => {
      if (!mounted) return;
      setChapter(c);
      setLoadingChapter(false);
    });
    return () => {
      mounted = false;
    };
  }, [code]);

  // Already a member of this chapter → straight to Home.
  useEffect(() => {
    if (profile && chapter && profile.chapter_id === chapter.id) {
      router.replace('/');
    }
  }, [profile, chapter, router]);

  const handleJoin = useCallback(async () => {
    if (!chapter) return;

    // Must be signed in to attach a profile. Send to signup, carrying the code.
    if (!session?.user) {
      router.replace({ pathname: '/signup', params: { code } });
      return;
    }

    setError(null);
    setJoining(true);

    // Invite link = instant join, no approval gate (V1 growth mechanism).
    const { error: insertError } = await supabase.from('profiles').insert({
      user_id: session.user.id,
      chapter_id: chapter.id,
      email: session.user.email,
      name: (session.user.user_metadata?.name as string) ?? session.user.email,
      status: 'approved',
    });

    setJoining(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await refreshProfile();
    router.replace('/');
  }, [chapter, session, code, router, refreshProfile]);

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
          label="Go to login"
          variant="secondary"
          fullWidth={false}
          onPress={() => router.replace('/login')}
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
