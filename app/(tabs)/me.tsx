import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';

// Phase 1: just identity + sign out. Phase 2 adds profile editing, mentor/hiring
// toggles, and LinkedIn (see SCREENS.md "Me").
export default function MeScreen() {
  const { session, profile, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Me</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>
            {profile?.name ?? (session?.user?.user_metadata?.name as string) ?? '—'}
          </Text>

          <Text style={[styles.label, styles.spaced]}>Email</Text>
          <Text style={styles.value}>{session?.user?.email ?? '—'}</Text>

          {!!profile?.role && (
            <>
              <Text style={[styles.label, styles.spaced]}>Role</Text>
              <Text style={styles.value}>{profile.role}</Text>
            </>
          )}
        </View>

        <Button label="Sign out" variant="secondary" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.xl, gap: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  spaced: { marginTop: spacing.lg },
  value: { ...typography.body, color: colors.textPrimary },
});
