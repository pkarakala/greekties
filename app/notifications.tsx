import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useNotifications, type AppNotification } from '@/lib/inbox-notifications';
import { timeAgoShort } from '@/lib/time';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Validate a notification's deep-link path. Only in-app paths are allowed —
 * the url column is server-written, but validate anyway before routing (same
 * rule as extractAppPath in lib/notifications.ts: must start with '/', and
 * '//' would be a protocol-relative external URL).
 */
function appPath(url: string | null): string | null {
  if (typeof url !== 'string') return null;
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  return url;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { loading, error, notifications, unreadCount, reload, markAllRead, markRead } =
    useNotifications(session?.user?.id ?? null);

  function open(item: AppNotification) {
    void markRead(item.id);
    const path = appPath(item.url);
    if (path) router.push(path as Href);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Notifications" onBack={() => router.back()} />

      {unreadCount > 0 && (
        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications read"
            onPress={() => void markAllRead()}
            hitSlop={8}
          >
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => open(item)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.dotWrap}>
              {!item.read && <View style={styles.unreadDot} />}
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
                {item.title}
              </Text>
              {!!item.body && (
                <Text style={styles.body} numberOfLines={1}>
                  {item.body}
                </Text>
              )}
            </View>
            <Text style={styles.time}>{timeAgoShort(item.created_at)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {error ?? 'Nothing yet. We’ll let you know.'}
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

  actionsRow: { alignItems: 'flex-end', paddingHorizontal: spacing.lg },
  markAll: { ...typography.bodySmall, color: colors.gold, fontWeight: '600' },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { backgroundColor: colors.surfaceHover },
  dotWrap: { width: 10, alignItems: 'center' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  rowBody: { flex: 1, gap: 2 },
  title: { ...typography.body, color: colors.textPrimary },
  titleUnread: { fontWeight: '600' },
  body: { ...typography.bodySmall, color: colors.textSecondary },
  time: { ...typography.caption, color: colors.textTertiary },

  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
