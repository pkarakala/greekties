import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  useChapterReports,
  updateReportStatus,
  type ContentReport,
  type ReportStatus,
  type ReportTargetType,
} from '@/lib/moderation';
import { timeAgoShort } from '@/lib/time';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/theme';

const TARGET_LABELS: Record<ReportTargetType, string> = {
  profile: 'Profile',
  channel_message: 'Channel message',
  mentorship_message: 'Mentorship message',
  job: 'Job',
};

function statusTone(status: string): 'gold' | 'green' | 'neutral' {
  if (status === 'open') return 'gold';
  if (status === 'resolved') return 'green';
  return 'neutral';
}

export default function ReportsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { loading, error, reports, reload } = useChapterReports(profile?.chapter_id ?? null);
  // Optimistic status overrides so Resolve/Dismiss feel instant.
  const [overrides, setOverrides] = useState<Record<string, ReportStatus>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(report: ContentReport, status: ReportStatus) {
    setBusyId(report.id);
    setOverrides((prev) => ({ ...prev, [report.id]: status }));
    const { error: err } = await updateReportStatus(report.id, status);
    setBusyId(null);
    if (err) {
      // Roll back the optimistic update.
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[report.id];
        return next;
      });
      Alert.alert('Couldn’t update report', err);
    } else {
      reload();
    }
  }

  function openTarget(report: ContentReport) {
    if (report.target_type === 'profile') {
      router.push({ pathname: '/profile/[id]', params: { id: report.target_id } });
    } else if (report.target_type === 'job') {
      router.push({ pathname: '/jobs/[id]', params: { id: report.target_id } });
    }
    // Message types have no detail route — the reason text carries context.
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Reports" onBack={() => router.back()} />

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
        }
        renderItem={({ item }) => {
          const status = overrides[item.id] ?? item.status;
          const tappable = item.target_type === 'profile' || item.target_type === 'job';
          return (
            <Card style={styles.card} onPress={tappable ? () => openTarget(item) : undefined}>
              <View style={styles.badgeRow}>
                <Badge label={TARGET_LABELS[item.target_type] ?? item.target_type} tone="neutral" />
                <Badge label={status} tone={statusTone(status)} />
                <View style={styles.flex} />
                <Text style={styles.time}>{timeAgoShort(item.created_at)}</Text>
              </View>

              <Text style={styles.reason}>{item.reason?.trim() || 'No reason given.'}</Text>

              {tappable ? (
                <View style={styles.targetRow}>
                  <Text style={styles.targetHint}>
                    Tap to view the reported {item.target_type === 'job' ? 'job' : 'profile'}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                </View>
              ) : (
                <Text style={styles.targetHint}>Message ID: {item.target_id}</Text>
              )}

              {status === 'open' && (
                <View style={styles.actions}>
                  <View style={styles.flex}>
                    <Button
                      label="Resolve"
                      onPress={() => setStatus(item, 'resolved')}
                      loading={busyId === item.id}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Button
                      label="Dismiss"
                      variant="secondary"
                      onPress={() => setStatus(item, 'dismissed')}
                      disabled={busyId === item.id}
                    />
                  </View>
                </View>
              )}
            </Card>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {error ?? 'No reports. Your chapter is in good standing.'}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.sm },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  time: { ...typography.caption, color: colors.textTertiary },
  reason: { ...typography.body, color: colors.textPrimary },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  targetHint: { ...typography.caption, color: colors.textTertiary },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
