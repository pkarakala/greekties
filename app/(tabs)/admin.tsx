import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/types';
import { usePendingMembers } from '@/lib/admin';
import { Card } from '@/components/Card';
import { colors, radius, spacing, typography } from '@/theme';

export default function AdminScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const chapterId = profile?.chapter_id ?? null;

  const { members: pending, reload } = usePendingMembers(chapterId);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // Defensive: the tab is already hidden for non-admins.
  if (!isAdmin(profile)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.muted}>Admins only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin</Text>
        <Text style={styles.subtitle}>Manage your chapter</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <NavRow
          icon="person-add"
          title="Member approvals"
          subtitle={
            pending.length > 0
              ? `${pending.length} waiting for approval`
              : 'No pending members'
          }
          badge={pending.length}
          onPress={() => router.push('/admin/approvals')}
        />
        <NavRow
          icon="chatbubbles"
          title="Channels"
          subtitle="Create, rename, or remove channels"
          onPress={() => router.push('/admin/channels')}
        />
        <NavRow
          icon="settings"
          title="Chapter settings"
          subtitle="Name, designation, invite link"
          onPress={() => router.push('/admin/settings')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function NavRow({
  icon,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Card style={styles.row} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.gold} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      {!!badge && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  scroll: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.body, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: { ...typography.h3, color: colors.textPrimary },
  rowSub: { ...typography.bodySmall, color: colors.textSecondary },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.caption, color: colors.background, fontWeight: '700' },
});
