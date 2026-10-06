import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { chapterIdentity, memberScope, useChapterIdentity } from '@/lib/home';
import { Button } from '@/components/Button';
import { ReadStatus } from '@/components/ReadStatus';
import { useAuth } from '@/lib/auth';
import { useChannels, type ChannelListItem } from '@/lib/chat';
import { timeAgoShort } from '@/lib/time';
import { colors, spacing, typography } from '@/theme';

export default function ChannelListScreen() {
  const { profile, session } = useAuth();
  const scope = memberScope(profile, session?.user.id ?? null);
  return scope ? <ChannelList key={scope} scope={scope} /> : null;
}

function ChannelList({ scope }: { scope: string }) {
  const router = useRouter();
  const { profile, session, blockedIds } = useAuth();
  const chapterId = profile?.chapter_id ?? null;

  const { loading, error, sections, reload } = useChannels(
    chapterId,
    session?.user?.id ?? null,
    blockedIds,
  );
  const chapter = useChapterIdentity(scope, chapterId);
  const reloadChapter = chapter.reload;
  // Refresh unread state + previews whenever the list regains focus.
  useFocusEffect(
    useCallback(() => {
      reload();
      reloadChapter();
    }, [reload, reloadChapter]),
  );

  function renderItem({ item }: { item: ChannelListItem }) {
    const { channel, lastMessage, lastActivity, unread } = item;
    return (
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() =>
          router.push({ pathname: '/chats/[channelId]', params: { channelId: channel.id } })
        }
      >
        <Text style={styles.hash}>#</Text>
        <View style={styles.rowBody}>
          <Text style={[styles.channelName, unread && styles.unreadText]}>{channel.name}</Text>
          <Text style={styles.preview}>
            {lastMessage?.content ?? channel.description ?? 'No messages yet'}
          </Text>
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.time}>{lastMessage ? timeAgoShort(lastActivity) : ''}</Text>
          {unread && <View style={styles.dot} />}
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        {chapter.data && <Text style={styles.subtitle}>{chapterIdentity(chapter.data)}</Text>}
        <ReadStatus section={chapter} label="chapter identity" />
        <Button
          label="Mentorship conversations"
          variant="secondary"
          onPress={() => router.push('/inbox')}
        />
      </View>

      {!!error && (
        <View style={styles.recovery}>
          <Text accessibilityRole="alert" style={styles.subtitle}>
            Couldn’t refresh channels.
          </Text>
          <Button label="Retry channels" variant="secondary" onPress={reload} />
        </View>
      )}
      {loading && sections.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.channel.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
          }
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.center}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.textTertiary} />
                <Text style={styles.emptyText}>
                  {error
                    ? `Couldn’t load channels: ${error}`
                    : 'No channels yet — your chapter admins can create one.'}
                </Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  recovery: { padding: spacing.lg, gap: spacing.sm },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  list: { paddingBottom: spacing.xxxl },
  sectionHeader: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: { backgroundColor: colors.surfaceHover },
  hash: { ...typography.h2, color: colors.textTertiary },
  rowBody: { flex: 1, gap: 2 },
  channelName: { ...typography.h3, color: colors.textPrimary },
  unreadText: { color: colors.textPrimary, fontWeight: '700' },
  preview: { ...typography.bodySmall, color: colors.textSecondary },
  rowMeta: { alignItems: 'flex-end', gap: spacing.xs },
  time: { ...typography.caption, color: colors.textTertiary },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gold },
});
