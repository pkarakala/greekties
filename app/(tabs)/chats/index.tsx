import { useCallback, useEffect, useState } from 'react';
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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useChannels, type ChannelListItem } from '@/lib/chat';
import { timeAgoShort } from '@/lib/time';
import { colors, spacing, typography } from '@/theme';

export default function ChannelListScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const chapterId = profile?.chapter_id ?? null;

  const { loading, error, sections, reload } = useChannels(chapterId, session?.user?.id ?? null);
  const [chapterName, setChapterName] = useState<string | null>(null);

  useEffect(() => {
    if (!chapterId) return;
    let mounted = true;
    supabase
      .from('chapters')
      .select('name, designation, university')
      .eq('id', chapterId)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted || !data) return;
        const parts = [data.designation ?? data.name, data.university].filter(Boolean);
        setChapterName(parts.join(' · '));
      });
    return () => {
      mounted = false;
    };
  }, [chapterId]);

  // Refresh unread state + previews whenever the list regains focus.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  function renderItem({ item }: { item: ChannelListItem }) {
    const { channel, lastMessage, lastActivity, unread } = item;
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => router.push({ pathname: '/chats/[channelId]', params: { channelId: channel.id } })}
      >
        <Text style={styles.hash}>#</Text>
        <View style={styles.rowBody}>
          <Text style={[styles.channelName, unread && styles.unreadText]} numberOfLines={1}>
            {channel.name}
          </Text>
          <Text style={styles.preview} numberOfLines={1}>
            {lastMessage?.content ?? channel.description ?? 'No messages yet'}
          </Text>
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.time}>{timeAgoShort(lastActivity)}</Text>
          {unread && <View style={styles.dot} />}
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        {!!chapterName && <Text style={styles.subtitle}>{chapterName}</Text>}
      </View>

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
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
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
