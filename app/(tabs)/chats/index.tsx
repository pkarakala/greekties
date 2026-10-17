import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { chapterIdentity, memberScope, useChapterIdentity, type SectionRead } from '@/lib/home';
import {
  useChatsInbox,
  selectChatsRows,
  type ChatsInboxRow,
  type ChatsSource,
} from '@/lib/chats-inbox';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { ReadStatus } from '@/components/ReadStatus';
import { useAuth } from '@/lib/auth';
import { timeAgoShort } from '@/lib/time';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/chats';

export default function ChatsScreen() {
  const { profile, session } = useAuth();
  const scope = memberScope(profile, session?.user.id ?? null);
  return scope ? <ChatsInbox key={scope} scope={scope} /> : null;
}

function SourceStatus({ source, label }: { source: SectionRead<ChatsSource>; label: string }) {
  const failed = source.error || source.data?.previewsUnavailable;
  return (
    <>
      {source.loading && (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {source.data ? `Updating ${label}…` : `Loading ${label}…`}
        </Text>
      )}
      {failed && (
        <View style={styles.recovery}>
          <Text accessibilityRole="alert" style={styles.status}>
            Couldn’t refresh {label}.
            {source.error && source.data ? ' Showing the last loaded conversations.' : ''}
          </Text>
          <Button
            tone="home"
            label={`Retry ${label}`}
            variant="secondary"
            fullWidth={false}
            onPress={source.reload}
          />
        </View>
      )}
      {source.data?.hasMore && (
        <Text style={styles.status}>
          Showing the first 100 loaded {label}. Search covers loaded conversations.
        </Text>
      )}
    </>
  );
}

function ChatsInbox({ scope }: { scope: string }) {
  const router = useRouter();
  const { profile, session, blockedIds } = useAuth();
  const chapterId = profile!.chapter_id;
  const { fontScale } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Groups'>('All');
  const { groups, mentors, rows } = useChatsInbox(scope, chapterId, session!.user.id, blockedIds);
  const chapter = useChapterIdentity(scope, chapterId);
  const reloadGroups = groups.reload,
    reloadMentors = mentors.reload,
    reloadChapter = chapter.reload;
  const reload = useCallback(() => {
    reloadGroups();
    reloadMentors();
    reloadChapter();
  }, [reloadGroups, reloadMentors, reloadChapter]);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  const selectedRows = selectChatsRows(rows, filter, search);
  const loading = groups.loading || (filter === 'All' && mentors.loading);
  const unavailable =
    groups.error ||
    groups.data?.previewsUnavailable ||
    (filter === 'All' && (mentors.error || mentors.data?.previewsUnavailable));
  const limited = groups.data?.hasMore || (filter === 'All' && mentors.data?.hasMore);
  function open(row: ChatsInboxRow) {
    if (row.kind === 'group')
      router.push({ pathname: '/chats/[channelId]', params: { channelId: row.id } });
    else router.push({ pathname: '/inbox/[requestId]', params: { requestId: row.id } });
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={selectedRows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.blue} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {chapter.data && (
              <View style={styles.context}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.blue} />
                <Text style={styles.subtitle}>{chapterIdentity(chapter.data)}</Text>
              </View>
            )}
            <ReadStatus tone="home" section={chapter} label="chapter identity" />
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" style={styles.title}>
                Chats
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Requests, review mentorship requests"
                onPress={() => router.push('/inbox')}
                style={({ pressed }) => [styles.requests, pressed && styles.pressed]}
              >
                <Ionicons name="mail-outline" size={20} color={colors.navy} />
                <Text style={styles.requestLabel}>Requests</Text>
              </Pressable>
            </View>
            <View style={styles.search}>
              <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
              <TextInput
                accessibilityLabel="Search conversations"
                placeholder="Search conversations"
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={setSearch}
                style={styles.input}
                autoCorrect={false}
                returnKeyType="search"
              />
              {!!search && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => setSearch('')}
                  style={styles.clear}
                >
                  <Ionicons name="close" size={20} color={colors.navy} />
                </Pressable>
              )}
            </View>
            <View
              style={styles.filters}
              accessibilityRole="tablist"
              accessibilityLabel="Conversation filter"
            >
              {(['All', 'Groups'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: filter === value }}
                  aria-selected={filter === value}
                  onPress={() => setFilter(value)}
                  style={[styles.filter, filter === value && styles.selected]}
                >
                  <Text style={[styles.filterText, filter === value && styles.selectedText]}>
                    {value}
                  </Text>
                </Pressable>
              ))}
            </View>
            <SourceStatus source={groups} label="groups" />
            <SourceStatus source={mentors} label="mentorship" />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.kind === 'group' ? 'group' : 'accepted mentorship'}, ${item.preview}${item.activity ? `, ${timeAgoShort(item.activity)}` : ''}`}
            onPress={() => open(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            {item.kind === 'group' ? (
              <View style={styles.groupIcon}>
                <Ionicons name="chatbubbles-outline" size={23} color={colors.blue} />
              </View>
            ) : (
              <View style={styles.avatarSlot}>
                <Avatar
                  tone="home"
                  uri={item.avatar}
                  name={item.name === 'Member' ? null : item.name}
                  size="sm"
                />
              </View>
            )}
            <View style={styles.rowBody}>
              <View style={styles.nameLine}>
                <Text style={styles.name} numberOfLines={fontScale > 1.3 ? undefined : 2}>
                  {item.name}
                </Text>
                {item.activity && <Text style={styles.time}>{timeAgoShort(item.activity)}</Text>}
              </View>
              <Text style={styles.preview} numberOfLines={fontScale > 1.3 ? undefined : 1}>
                {item.preview}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator accessibilityLabel="Loading conversations" color={colors.blue} />
            ) : (
              <>
                <Ionicons name="chatbubbles-outline" size={36} color={colors.textTertiary} />
                <Text style={styles.emptyText}>
                  {unavailable
                    ? 'Some conversations are unavailable. Retry above.'
                    : search.trim()
                      ? 'No loaded conversations match your search.'
                      : limited
                        ? 'No visible conversations in the loaded results.'
                        : filter === 'Groups'
                          ? 'No groups yet.'
                          : 'No conversations yet.'}
                </Text>
              </>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: spacing.xxxl, maxWidth: 760, width: '100%', alignSelf: 'center' },
  header: { paddingHorizontal: 20, paddingTop: spacing.lg, gap: spacing.md },
  context: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  title: { ...typography.h1, color: colors.textPrimary },
  requests: {
    minHeight: 48,
    backgroundColor: colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
  },
  requestLabel: { ...typography.bodySmall, color: colors.navy, fontWeight: '600' },
  search: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  input: {
    minHeight: 48,
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
  },
  clear: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  filter: {
    flex: 1,
    minHeight: 48,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  selected: { borderBottomColor: colors.blue, backgroundColor: colors.gold },
  filterText: { ...typography.bodySmall, color: colors.textSecondary },
  selectedText: { fontWeight: '700', color: colors.navy },
  status: { ...typography.bodySmall, color: colors.textSecondary },
  recovery: { gap: spacing.sm, paddingBottom: spacing.sm },
  row: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 18,
  },
  pressed: { backgroundColor: colors.surfaceHover },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldLight,
  },
  avatarSlot: { minWidth: 44, alignItems: 'center' },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  name: {
    ...typography.h3,
    color: colors.textPrimary,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '65%',
  },
  time: { ...typography.caption, color: colors.textTertiary },
  preview: { ...typography.bodySmall, color: colors.textSecondary },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, paddingTop: spacing.xxxl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
