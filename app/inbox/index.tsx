import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useInbox } from '@/lib/mentorship';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/chats';
import type { MentorshipRequest, Profile } from '@/lib/types';

export default function InboxScreen() {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const { session, blockedIds } = useAuth();
  const { loading, error, incoming, outgoing, profiles, reload } = useInbox(
    session?.user?.id ?? null,
    blockedIds,
  );

  function row(req: MentorshipRequest, otherId: string) {
    const other: Profile | undefined = profiles[otherId];
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${other?.name ?? 'Member'}, ${req.status} mentorship request${req.message ? `, ${req.message}` : ''}`}
        key={req.id}
        style={[styles.row, fontScale >= 1.4 && styles.stacked]}
        onPress={() =>
          router.push({ pathname: '/inbox/[requestId]', params: { requestId: req.id } })
        }
      >
        <Avatar tone="home" uri={other?.avatar_url} name={other?.name} size="sm" />
        <View style={fontScale >= 1.4 ? styles.stackedBody : styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={fontScale >= 1.4 ? undefined : 2}>
            {other?.name ?? 'Member'}
          </Text>
          {!!req.message && (
            <Text style={styles.rowMsg} numberOfLines={fontScale >= 1.4 ? undefined : 2}>
              {req.message}
            </Text>
          )}
        </View>
        <View style={[styles.statusPill, req.status === 'accepted' && styles.acceptedPill]}>
          <Text style={styles.statusLabel}>{req.status}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader tone="home" title="Requests" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel="Loading requests" color={colors.blue} />
          <Text style={styles.emptyText}>Loading requests…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.blue} />
          }
        >
          {!!error && (
            <View style={styles.recovery}>
              <Text accessibilityRole="alert" style={styles.error}>
                Couldn’t load inbox: {error}
              </Text>
              <Button tone="home" label="Retry requests" variant="secondary" onPress={reload} />
            </View>
          )}

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
  scroll: {
    padding: 20,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  error: { ...typography.bodySmall, color: colors.red },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.h1, fontSize: 22, lineHeight: 28, color: colors.textPrimary },
  recovery: { gap: 8 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: colors.goldLight,
  },
  acceptedPill: { backgroundColor: colors.gold },
  statusLabel: { ...typography.caption, color: colors.navy, fontWeight: '600' },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  row: {
    minHeight: 70,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stackedBody: { width: '100%', gap: 2, minWidth: 0, flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
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
