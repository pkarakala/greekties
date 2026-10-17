import { AdminAccess } from '@/components/AdminAccess';
import { AccountReadStatus } from '@/components/AccountReadStatus';
import { useWindowDimensions, View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/types';
import { usePendingMembers } from '@/lib/admin';
import { useChapterReports } from '@/lib/moderation';
import { Card } from '@/components/Card';
import { radius, spacing } from '@/theme';
import { colors, typography } from '@/theme/account';

export default function AdminScreen() {
  return (
    <AdminAccess>
      <AdminScreenContent />
    </AdminAccess>
  );
}

function AdminScreenContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const chapterId = profile?.chapter_id ?? null;

  const {
    members: pending,
    loading: pendingLoading,
    error: pendingError,
    reload,
  } = usePendingMembers(chapterId);
  const {
    reports,
    loading: reportsLoading,
    error: reportsError,
    reload: reloadReports,
  } = useChapterReports(chapterId);
  const openReports = reports.filter((r) => r.status === 'open').length;

  useFocusEffect(
    useCallback(() => {
      reload();
      reloadReports();
    }, [reload, reloadReports]),
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
        <Text accessibilityRole="header" style={styles.title}>
          Admin
        </Text>
        <Text style={styles.subtitle}>Manage your chapter</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <AccountReadStatus
          loading={pendingLoading}
          error={pendingError}
          reload={reload}
          label="member approvals"
        />
        <AccountReadStatus
          loading={reportsLoading}
          error={reportsError}
          reload={reloadReports}
          label="reports"
        />
        <NavRow
          icon="person-add"
          title="Member approvals"
          subtitle={
            pendingLoading
              ? 'Loading member approvals…'
              : pendingError
                ? 'Member approvals unavailable'
                : pending.length > 0
                  ? `${pending.length} pending requests loaded`
                  : 'No pending members'
          }
          badge={pending.length}
          onPress={() => router.push('/admin/approvals')}
        />
        <NavRow
          icon="flag-outline"
          title="Reports"
          subtitle={
            reportsLoading
              ? 'Loading reports…'
              : reportsError
                ? 'Reports unavailable'
                : openReports > 0
                  ? `${openReports} open reports loaded`
                  : 'No open reports'
          }
          badge={openReports}
          onPress={() => router.push('/admin/reports')}
        />
        <NavRow
          icon="people-outline"
          title="Members"
          subtitle="Membership, roles, and removals"
          onPress={() => router.push('/admin/members')}
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
  const { width, fontScale } = useWindowDimensions();
  return (
    <Card
      tone="home"
      style={[styles.row, (width < 350 || fontScale >= 1.4) && styles.stacked]}
      onPress={onPress}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.blue} />
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
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.goldLight,
    borderBottomWidth: 6,
    borderBottomColor: colors.gold,
  },
  title: { ...typography.h1, color: colors.blue },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  scroll: { padding: 20, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.body, color: colors.textSecondary },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { minWidth: 0, flexShrink: 1 },
  rowTitle: { ...typography.h3, color: colors.textPrimary },
  rowSub: { ...typography.bodySmall, color: colors.textSecondary },
  badge: {
    minWidth: 22,
    minHeight: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.caption, color: colors.navy, fontWeight: '700' },
});
