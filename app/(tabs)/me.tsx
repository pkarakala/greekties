import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Linking, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { openExternalUrl } from '@/lib/url';
import { TERMS_URL, PRIVACY_URL, SUPPORT_EMAIL } from '@/lib/legal';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/theme';

export default function MeScreen() {
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const displayName =
    profile?.name ?? (session?.user?.user_metadata?.name as string) ?? 'Member';

  function contactSupport() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {
      Alert.alert('Couldn’t open mail', `Email us at ${SUPPORT_EMAIL}`);
    });
  }

  // App Store guideline 5.1.1(v): in-app account deletion. The RPC deletes the
  // caller's data + auth user server-side; if the migration hasn't run yet,
  // fall back to directing the user to support.
  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, profile, and messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.rpc('delete_own_account');
            setDeleting(false);
            if (error) {
              Alert.alert(
                'Couldn’t delete your account',
                `Email ${SUPPORT_EMAIL} and we’ll delete it for you.`,
              );
              return;
            }
            await signOut();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Me</Text>

        <Card style={styles.identityCard}>
          <Avatar uri={profile?.avatar_url} name={displayName} size="md" />
          <View style={styles.flex}>
            <Text style={styles.name}>{displayName}</Text>
            {!!(profile?.role || session?.user?.email) && (
              <Text style={styles.sub}>{profile?.role ?? session?.user?.email}</Text>
            )}
          </View>
        </Card>

        <Button
          label="Edit profile"
          variant="secondary"
          onPress={() => router.push('/profile/edit')}
        />

        <Card style={styles.rows}>
          <Row
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => void openExternalUrl(TERMS_URL)}
          />
          <Row
            icon="lock-closed-outline"
            label="Privacy Policy"
            onPress={() => void openExternalUrl(PRIVACY_URL)}
          />
          <Row icon="mail-outline" label="Contact support" onPress={contactSupport} last />
        </Card>

        <Button label="Sign out" variant="secondary" onPress={signOut} />

        <Card style={styles.rows}>
          <Row
            icon="trash-outline"
            label={deleting ? 'Deleting…' : 'Delete account'}
            destructive
            onPress={confirmDeleteAccount}
            last
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={destructive ? colors.red : colors.textSecondary} />
      <Text style={[styles.rowLabel, destructive && styles.rowDestructive]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  title: { ...typography.h1, color: colors.textPrimary },
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.h2, color: colors.textPrimary },
  sub: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  rows: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceHover },
  rowLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  rowDestructive: { color: colors.red },
});
