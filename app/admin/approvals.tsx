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
import { colors, spacing, typography } from '@/theme';
import type { Profile } from '@/lib/types';

export default function ApprovalsScreen() {
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
      `This removes ${p.name ?? 'this pending member'}’s request. They can rejoin with an invite link.`,
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
      <ScreenHeader title="Member approvals" onBack={() => router.back()} />

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.identity}>
              <Avatar uri={item.avatar_url} name={item.name} size="sm" />
              <View style={styles.flex}>
                <Text style={styles.name}>{item.name ?? 'New member'}</Text>
                {!!item.email && <Text style={styles.email}>{item.email}</Text>}
              </View>
            </View>
            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button label="Approve" onPress={() => approve(item)} loading={busyId === item.id} />
              </View>
              <View style={styles.flex}>
                <Button label="Reject" variant="secondary" onPress={() => confirmReject(item)} />
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {error ? `Couldn’t load requests: ${error}` : 'No pending members. All caught up.'}
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
  card: { gap: spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.h3, color: colors.textPrimary },
  email: { ...typography.bodySmall, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.md },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
