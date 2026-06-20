import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useInbox } from '@/lib/mentorship';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { colors, spacing, typography } from '@/theme';
import type { MentorshipRequest, Profile, RequestStatus } from '@/lib/types';

function statusTone(s: RequestStatus): 'gold' | 'green' | 'neutral' {
  if (s === 'accepted') return 'green';
  if (s === 'pending') return 'gold';
  return 'neutral';
}

export default function InboxScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { loading, error, incoming, outgoing, profiles, reload } = useInbox(
    session?.user?.id ?? null,
  );

  function row(req: MentorshipRequest, otherId: string) {
    const other: Profile | undefined = profiles[otherId];
    return (
      <Card
        key={req.id}
        style={styles.row}
        onPress={() =>
          router.push({ pathname: '/inbox/[requestId]', params: { requestId: req.id } })
        }
      >
        <Avatar uri={other?.avatar_url} name={other?.name} size="sm" />
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>
            {other?.name ?? 'Member'}
          </Text>
          {!!req.message && (
            <Text style={styles.rowMsg} numberOfLines={1}>
              {req.message}
            </Text>
          )}
        </View>
        <Badge label={req.status} tone={statusTone(req.status)} />
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Inbox" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
          }
        >
          {!!error && <Text style={styles.error}>Couldn’t load inbox: {error}</Text>}

          {incoming.length === 0 && outgoing.length === 0 && !error && (
            <View style={styles.empty}>
              <Ionicons name="mail-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                No mentorship requests yet. Find a mentor in the directory to get started.
              </Text>
            </View>
          )}

          {incoming.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Requests for you</Text>
              {incoming.map((r) => row(r, r.from_user_id))}
            </View>
          )}

          {outgoing.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your requests</Text>
              {outgoing.map((r) => row(r, r.to_user_id))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl },
  error: { ...typography.bodySmall, color: colors.red },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBody: { flex: 1, gap: 2 },
  rowName: { ...typography.h3, color: colors.textPrimary },
  rowMsg: { ...typography.bodySmall, color: colors.textSecondary },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
