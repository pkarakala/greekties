import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useChapterMemberList, setMemberRole, removeMember } from '@/lib/admin';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { SearchBar } from '@/components/SearchBar';
import { colors, spacing, typography } from '@/theme';
import type { AdminRole, Profile } from '@/lib/types';

function roleLine(p: Profile): string {
  // "Software Engineer at Google" / "Google" / "Member" — same as the directory.
  if (p.job_title && p.company) return `${p.job_title} at ${p.company}`;
  return p.job_title || p.company || p.role || 'Member';
}

/**
 * Who may act on whom (mirrored server-side only if the live profiles RLS
 * enforces it — see lib/admin.ts): owners are untouchable, managers can be
 * modified only by owners, regular members by any admin.
 */
function canModify(me: Profile | null, target: Pick<Profile, 'admin_role'>): boolean {
  if (target.admin_role === 'owner') return false;
  if (target.admin_role === 'manager') return me?.admin_role === 'owner';
  return me?.admin_role === 'owner' || me?.admin_role === 'manager';
}

export default function MembersScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { loading, error, members, reload } = useChapterMemberList(profile?.chapter_id ?? null);

  const [query, setQuery] = useState('');
  // Optimistic overrides so role changes / removals feel instant.
  const [roleOverrides, setRoleOverrides] = useState<Record<string, AdminRole>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (removedIds.has(m.id)) return false;
      if (!q) return true;
      return [m.name, m.company]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [members, query, removedIds]);

  function effectiveRole(p: Profile): AdminRole {
    return p.id in roleOverrides ? roleOverrides[p.id] : p.admin_role;
  }

  async function changeRole(p: Profile, role: 'manager' | null) {
    setBusyId(p.id);
    setRoleOverrides((prev) => ({ ...prev, [p.id]: role }));
    const err = await setMemberRole(p.id, role);
    setBusyId(null);
    if (err) {
      // Roll back the optimistic update.
      setRoleOverrides((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      Alert.alert('Couldn’t update role', err);
    } else {
      reload();
    }
  }

  function confirmRemove(p: Profile) {
    Alert.alert(
      'Remove from chapter?',
      `${p.name ?? 'This member'} will lose access to the chapter. They can rejoin with an invite link.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(p.id);
            setRemovedIds((prev) => new Set(prev).add(p.id));
            const err = await removeMember(p.id);
            setBusyId(null);
            if (err) {
              // Roll back the optimistic removal.
              setRemovedIds((prev) => {
                const next = new Set(prev);
                next.delete(p.id);
                return next;
              });
              Alert.alert('Couldn’t remove member', err);
            } else {
              reload();
            }
          },
        },
      ],
    );
  }

  function openActions(p: Profile) {
    const role = effectiveRole(p);
    Alert.alert(p.name ?? 'Member', undefined, [
      role === 'manager'
        ? { text: 'Remove manager', onPress: () => changeRole(p, null) }
        : { text: 'Make manager', onPress: () => changeRole(p, 'manager') },
      { text: 'Remove from chapter', style: 'destructive', onPress: () => confirmRemove(p) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Members" onBack={() => router.back()} />

      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search name or company" />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
        }
        renderItem={({ item }) => {
          const role = effectiveRole(item);
          const showActions = canModify(profile, { admin_role: role });
          return (
            <Card style={styles.row}>
              <Avatar uri={item.avatar_url} name={item.name} size="sm" />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name ?? 'Member'}
                  </Text>
                  {role === 'owner' && <Badge label="Owner" tone="gold" />}
                  {role === 'manager' && <Badge label="Manager" tone="neutral" />}
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {roleLine(item)}
                </Text>
              </View>
              {showActions && (
                <Pressable
                  onPress={() => openActions(item)}
                  hitSlop={12}
                  disabled={busyId === item.id}
                  accessibilityLabel={`Actions for ${item.name ?? 'member'}`}
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={20}
                    color={busyId === item.id ? colors.textTertiary : colors.textSecondary}
                  />
                </Pressable>
              )}
            </Card>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {error
                  ? `Couldn’t load members: ${error}`
                  : query
                    ? 'No members match your search.'
                    : 'No approved members yet.'}
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
  searchWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.h3, color: colors.textPrimary, flexShrink: 1 },
  sub: { ...typography.bodySmall, color: colors.textSecondary },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
