import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useBlockedProfiles, unblockUser, type BlockedEntry } from '@/lib/moderation';
import { AccountReadStatus } from '@/components/AccountReadStatus';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/account';

function subtitle(entry: BlockedEntry): string {
  // "Software Engineer at Google" / "Google" / "Member" — same as the directory.
  const p = entry.profile;
  if (!p) return 'Account no longer exists';
  return p.company || p.role || 'Member';
}

export default function BlockedMembersScreen() {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const { session } = useAuth();
  const myUserId = session?.user?.id ?? null;
  const { loading, error, blocked, reload } = useBlockedProfiles(myUserId);

  // Optimistic removals so Unblock feels instant.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(
    () => blocked.filter((entry) => !removedIds.has(entry.blockedId)),
    [blocked, removedIds],
  );

  function confirmUnblock(entry: BlockedEntry) {
    const name = entry.profile?.name ?? 'this member';
    Alert.alert(
      `Unblock ${name}?`,
      'You’ll see their messages and profile again, and they can contact you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            if (!myUserId) return;
            setBusyId(entry.blockedId);
            setRemovedIds((prev) => new Set(prev).add(entry.blockedId));
            const { error: err } = await unblockUser(myUserId, entry.blockedId);
            setBusyId(null);
            if (err) {
              // Roll back the optimistic removal.
              setRemovedIds((prev) => {
                const next = new Set(prev);
                next.delete(entry.blockedId);
                return next;
              });
              Alert.alert('Couldn’t unblock', err);
            } else {
              reload();
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader tone="home" title="Blocked members" onBack={() => router.back()} />

      <FlatList
        ListHeaderComponent={
          <AccountReadStatus
            loading={loading}
            error={error}
            reload={reload}
            label="blocked members"
          />
        }
        data={visible}
        keyExtractor={(item) => item.blockedId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
        }
        renderItem={({ item }) => (
          <Card
            tone="home"
            style={[styles.row, (width < 350 || fontScale >= 1.4) && styles.stacked]}
          >
            <Avatar
              tone="home"
              uri={item.profile?.avatar_url}
              name={item.profile?.name}
              size="sm"
            />
            <View style={styles.rowBody}>
              <Text style={styles.name}>{item.profile?.name ?? 'Member'}</Text>
              <Text style={styles.sub}>{subtitle(item)}</Text>
            </View>
            <Button
              tone="home"
              label="Unblock"
              variant="secondary"
              fullWidth={false}
              loading={busyId === item.blockedId}
              onPress={() => confirmUnblock(item)}
            />
          </Card>
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {error ? 'Blocked members are unavailable.' : 'You haven’t blocked anyone.'}
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
  list: { padding: 20, gap: spacing.md },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBody: { flexShrink: 1, minWidth: 0, gap: 2 },
  name: { ...typography.h3, color: colors.textPrimary },
  sub: { ...typography.bodySmall, color: colors.textSecondary },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
