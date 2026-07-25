import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { storePendingInviteCode, consumePendingInviteCode } from '@/lib/invite';
import { Wordmark } from '@/components/Wordmark';
import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';
import type { Chapter } from '@/lib/types';

// Resolve the invite code to a chapter for the confirmation card. Server-side
// codes live in chapter_invites (app-v2-invites.sql); until that migration
// runs we fall back to legacy links that carried the raw chapter id.
async function resolveChapter(code: string): Promise<Chapter | null> {
  const byInvite = await supabase
    .from('chapter_invites')
    .select('chapter_id, chapters(*)')
    .eq('code', code)
    .eq('revoked', false)
    .maybeSingle();

  if (!byInvite.error && byInvite.data) {
    const nested = (byInvite.data as { chapters: Chapter | Chapter[] | null }).chapters;
    const chapter = Array.isArray(nested) ? nested[0] : nested;
    if (chapter) return chapter;
  }

  // Legacy fallback: table missing (migration not run) or the code is a
  // chapter id from an old link.
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

    // Preferred path: server-validated join (app-v2-invites.sql). The RPC
    // checks the code, enforces one-chapter-per-account, and creates the
    // profile server-side so the client never sets status/chapter_id itself.
    const { error: rpcError } = await supabase.rpc('join_chapter', {
      invite_code: code,
    });

    if (!rpcError) {
      await consumePendingInviteCode(); // clear any stored copy of this code
      await refreshProfile();
      setJoining(false);
      router.replace('/');
      return;
    }

    // RPC missing → migration not run yet; use the legacy insert, guarded.
    const fnMissing =
      rpcError.code === '42883' || rpcError.code === 'PGRST202';
    if (!fnMissing) {
      setJoining(false);
      setError(rpcError.message);
      return;
    }

    if (profile) {
      // Already in a different chapter — never insert a second profiles row
      // (duplicate rows break the app's single-profile session load).
      setJoining(false);
      setError('You already belong to a chapter. Each account can only join one chapter.');
      return;
    }

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

    await consumePendingInviteCode(); // clear any stored copy of this code
    await refreshProfile();
    router.replace('/');
  }, [chapter, joining, session, profile, code, router, refreshProfile]);

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
  if (profile && profile.chapter_id !== chapter.id) {
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
