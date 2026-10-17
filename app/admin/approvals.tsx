import { AdminAccess } from '@/components/AdminAccess';
import { AccountReadStatus } from '@/components/AccountReadStatus';
import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { usePendingMembers, approveMember, rejectMember } from '@/lib/admin';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/account';
import type { Profile } from '@/lib/types';

export default function ApprovalsScreen() {
  return (
    <AdminAccess>
      <ApprovalsScreenContent />
    </AdminAccess>
  );
}

function ApprovalsScreenContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { loading, error, members, reload } = usePendingMembers(profile?.chapter_id ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(p: Profile) {
    setBusyId(p.id);
    const err = await approveMember(p.id);
    setBusyId(null);
    if (err) Alert.alert('Couldn’t approve', err);
    else reload();
  }

  function confirmReject(p: Profile) {
    Alert.alert(
      'Reject member?',
      `This removes ${p.name ?? 'this pending member'}’s request. A chapter admin must explicitly reinstate them; an invitation cannot restore access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setBusyId(p.id);
            const err = await rejectMember(p.id);
            setBusyId(null);
            if (err) Alert.alert('Couldn’t reject', err);
            else reload();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader tone="home" title="Member approvals" onBack={() => router.back()} />

      <FlatList
        ListHeaderComponent={
          <AccountReadStatus
            loading={loading}
            error={error}
            reload={reload}
            label="member approvals"
          />
        }
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
        }
        renderItem={({ item }) => (
          <Card tone="home" style={styles.card}>
            <View style={styles.identity}>
              <Avatar tone="home" uri={item.avatar_url} name={item.name} size="sm" />
              <View style={styles.flex}>
                <Text style={styles.name}>{item.name ?? 'New member'}</Text>
                {!!item.email && <Text style={styles.email}>{item.email}</Text>}
              </View>
            </View>
            <View style={styles.actions}>
              <View style={styles.actionBody}>
                <Button
                  tone="home"
                  label="Approve"
                  onPress={() => approve(item)}
                  loading={busyId === item.id}
                />
              </View>
              <View style={styles.actionBody}>
                <Button
                  tone="home"
                  label="Reject"
                  variant="secondary"
                  onPress={() => confirmReject(item)}
                />
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {error ? 'Member approvals are unavailable.' : 'No pending members. All caught up.'}
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
  list: { padding: 20, gap: spacing.md },
  card: { gap: spacing.md, borderTopWidth: 6, borderTopColor: colors.gold },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.h3, color: colors.textPrimary },
  email: { ...typography.bodySmall, color: colors.textSecondary },
  actionBody: { width: '100%', flexShrink: 0 },
  actions: { gap: spacing.md },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
