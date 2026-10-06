import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { chapterIdentity, memberScope, useChapterIdentity, useHomeOverview } from '@/lib/home';
import { isAdmin } from '@/lib/types';
import { ReadStatus } from '@/components/ReadStatus';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { profile, session, blockedIds } = useAuth();
  const scope = memberScope(profile, session?.user.id ?? null);
  const chapter = useChapterIdentity(scope, profile?.chapter_id ?? null);
  const { event, jobs, conversations, reload } = useHomeOverview(
    scope,
    profile?.chapter_id ?? null,
    blockedIds,
  );
  const reloadChapter = chapter.reload;
  const [now, setNow] = useState(Date.now);
  const refresh = useCallback(() => {
    setNow(Date.now());
    reloadChapter();
    reload();
  }, [reloadChapter, reload]);
  useEffect(() => {
    if (!event.data) return;
    const timer = setTimeout(
      refresh,
      Math.min(2147483647, Math.max(0, Date.parse(event.data.starts_at) - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [event.data, refresh]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  if (!scope) return null;
  const upcoming = event.data && Date.parse(event.data.starts_at) > now ? event.data : null;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={chapter.loading || event.loading || jobs.loading || conversations.loading}
            onRefresh={refresh}
            tintColor={colors.navy}
          />
        }
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Home
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
            onPress={() => router.push('/notifications')}
            style={styles.iconButton}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.navy} />
          </Pressable>
        </View>
        <View style={styles.identity}>
          <Text style={styles.eyebrow}>YOUR CHAPTER</Text>
          {chapter.data && <Text style={styles.chapter}>{chapterIdentity(chapter.data)}</Text>}
          <ReadStatus section={chapter} label="chapter identity" />
          {!!profile?.name && (
            <Text style={styles.meta}>Welcome back, {profile.name.split(' ')[0]}.</Text>
          )}
        </View>
        <View style={styles.section}>
          <SectionHeading
            title="Coming up"
            label="All events"
            onPress={() => router.push('/events')}
          />
          <ReadStatus section={event} label="upcoming event" />
          {upcoming ? (
            <Card
              onPress={() => router.push({ pathname: '/events/[id]', params: { id: upcoming.id } })}
            >
              <Text style={styles.itemTitle}>{upcoming.title}</Text>
              <Text style={styles.meta}>
                {new Date(upcoming.starts_at).toLocaleString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
              {!!upcoming.location && <Text style={styles.meta}>{upcoming.location}</Text>}
            </Card>
          ) : (
            event.data !== undefined &&
            !event.error && <Text style={styles.meta}>No upcoming events scheduled.</Text>
          )}
        </View>
        <View style={styles.section}>
          <SectionHeading
            title="Opportunities"
            label="Browse jobs"
            onPress={() => router.push({ pathname: '/people', params: { view: 'jobs' } })}
          />
          <ReadStatus section={jobs} label="job opportunities" />
          {jobs.data?.map((job) => (
            <Card
              key={job.id}
              onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
            >
              <Text style={styles.itemTitle}>{job.title}</Text>
              <Text style={styles.meta}>
                {[job.company, job.location].filter(Boolean).join(' · ')}
              </Text>
            </Card>
          ))}
          {jobs.data?.length === 0 && !jobs.error && (
            <Text style={styles.meta}>No open opportunities yet.</Text>
          )}
        </View>
        <View style={styles.section}>
          <SectionHeading
            title="Conversations"
            label="All chats"
            onPress={() => router.push('/chats')}
          />
          <ReadStatus section={conversations} label="conversation activity" />
          {conversations.data && (
            <Card
              onPress={() =>
                router.push({
                  pathname: '/chats/[channelId]',
                  params: { channelId: conversations.data!.channel_id },
                })
              }
            >
              <Text style={styles.itemTitle}># {conversations.data.channels.name}</Text>
              <Text style={styles.meta}>
                Latest message ·{' '}
                {new Date(conversations.data.created_at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </Card>
          )}
          {conversations.data === null && !conversations.error && (
            <Text style={styles.meta}>Browse your chapter channels and join a conversation.</Text>
          )}
        </View>
        <View style={styles.footer}>
          <Button
            label="Explore your network"
            variant="ghost"
            onPress={() => router.push('/network')}
          />
          <Button
            label="Alumni map · sharing is optional"
            variant="ghost"
            onPress={() => router.push('/map')}
          />
          <Button
            label="View or complete your profile"
            variant="secondary"
            onPress={() => router.push('/me')}
          />
          {isAdmin(profile) && (
            <Button
              label="Chapter invitations"
              variant="ghost"
              onPress={() => router.push('/admin/settings')}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeading({
  title,
  label,
  onPress,
}: {
  title: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
        <Text style={styles.linkText}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: { ...typography.h1, color: colors.navy, flex: 1 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  identity: {
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    paddingLeft: spacing.lg,
  },
  eyebrow: { ...typography.caption, color: colors.textSecondary, letterSpacing: 1 },
  chapter: { ...typography.h2, color: colors.navy },
  section: { gap: spacing.md },
  sectionHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: { ...typography.h3, color: colors.navy },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { ...typography.bodySmall, fontWeight: '600', color: colors.gold },
  itemTitle: { ...typography.h3, color: colors.navy, marginBottom: spacing.xs },
  meta: { ...typography.bodySmall, color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.red },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
});
