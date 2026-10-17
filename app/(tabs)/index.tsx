import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  chapterIdentity,
  memberScope,
  useChapterIdentity,
  useHomeOverview,
  useMembershipCounts,
} from '@/lib/home';
import { isAdmin } from '@/lib/types';
import { ReadStatus } from '@/components/ReadStatus';
import { EventDateTile } from '@/components/EventDateTile';
import { Button } from '@/components/Button';
import { spacing, typography } from '@/theme';
import { homeColors as colors, homeTypography } from '@/theme/home';

export default function HomeScreen() {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 350 || fontScale >= 1.4;
  const { profile, session, blockedIds } = useAuth();
  const scope = memberScope(profile, session?.user.id ?? null);
  const chapter = useChapterIdentity(scope, profile?.chapter_id ?? null);
  const membership = useMembershipCounts(scope, profile?.chapter_id ?? null, blockedIds);
  const { event, jobs, conversations, reload } = useHomeOverview(
    scope,
    profile?.chapter_id ?? null,
    blockedIds,
  );
  const reloadChapter = chapter.reload;
  const reloadMembership = membership.reload;
  const [now, setNow] = useState(Date.now);
  const refresh = useCallback(() => {
    setNow(Date.now());
    reloadChapter();
    reloadMembership();
    reload();
  }, [reloadChapter, reloadMembership, reload]);
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
            refreshing={
              chapter.loading ||
              membership.loading ||
              event.loading ||
              jobs.loading ||
              conversations.loading
            }
            onRefresh={refresh}
            tintColor={colors.navy}
          />
        }
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Greek Ties
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
        <View>
          <View style={styles.identity}>
            {!!profile?.name && (
              <Text style={styles.identityMeta}>
                Welcome back, {profile.name.trim().split(/\s+/)[0]}.
              </Text>
            )}
            <Text style={styles.eyebrow}>YOUR CHAPTER, BEYOND COLLEGE</Text>
            {chapter.data && (
              <View
                accessible
                accessibilityRole="header"
                accessibilityLabel={chapterIdentity(chapter.data)}
                style={styles.chapterIdentity}
              >
                <Text style={styles.chapter}>
                  {[chapter.data.name, chapter.data.designation].filter(Boolean).join(' · ')}
                </Text>
                {!!chapter.data.university && (
                  <Text style={styles.identityUniversity}>{chapter.data.university}</Text>
                )}
              </View>
            )}
          </View>
          <View style={styles.identityStatus}>
            <ReadStatus tone="home" section={chapter} label="chapter identity" />
          </View>
          <View style={[styles.membershipRow, stacked && styles.stacked]}>
            {(
              [
                ['active', 'Current members'],
                ['alumni', 'Alumni'],
              ] as const
            ).map(([type, label]) => (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityLabel={`${label}${membership.data ? `, ${membership.data[type].toLocaleString()}` : ''}. Open directory`}
                onPress={() =>
                  router.push({
                    pathname: '/people',
                    params: { view: 'directory', membership: type },
                  })
                }
                style={({ pressed }) => [
                  styles.membershipCount,
                  stacked && { flexBasis: 'auto' },
                  pressed && styles.membershipPressed,
                ]}
              >
                <Text style={styles.membershipNumber}>
                  {membership.data ? membership.data[type].toLocaleString() : '—'}
                </Text>
                <Text style={styles.membershipLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.identityStatus}>
            <ReadStatus tone="home" section={membership} label="membership counts" />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Find mentors"
            onPress={() => router.push({ pathname: '/people', params: { filter: 'mentors' } })}
            style={({ pressed }) => [styles.mentorLink, pressed && styles.pressed]}
          >
            <Ionicons name="people-outline" size={20} color={colors.blue} />
            <Text style={styles.linkText}>Find mentors</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.blue} />
          </Pressable>
        </View>
        <View style={styles.section}>
          <SectionHeading
            title="Coming up"
            label="All events"
            onPress={() => router.push('/events')}
          />
          <ReadStatus tone="home" section={event} label="upcoming event" />
          {upcoming ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View event: ${upcoming.title}`}
              onPress={() => router.push({ pathname: '/events/[id]', params: { id: upcoming.id } })}
              style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
            >
              <View style={[styles.eventRow, stacked && styles.stacked]}>
                <EventDateTile tone="home" startsAt={upcoming.starts_at} />
                <View style={styles.itemBody}>
                  {!!upcoming.category && (
                    <Text style={styles.category}>
                      {upcoming.category.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  )}
                  <Text style={styles.eventTitle}>{upcoming.title}</Text>
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
                </View>
              </View>
              <View style={styles.eventAction}>
                <Text style={styles.primaryLabel}>View event</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.surface} />
              </View>
            </Pressable>
          ) : (
            event.data !== undefined &&
            !event.error && <Text style={styles.meta}>No upcoming events scheduled.</Text>
          )}
        </View>
        <View style={styles.section}>
          <SectionHeading
            title="Conversations"
            label="All chats"
            onPress={() => router.push('/chats')}
          />
          <ReadStatus tone="home" section={conversations} label="conversation activity" />
          {conversations.data && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open conversation: ${conversations.data.channels.name}. ${conversations.data.content ?? 'Latest message'}. ${new Date(conversations.data.created_at).toLocaleString()}`}
              onPress={() =>
                router.push({
                  pathname: '/chats/[channelId]',
                  params: { channelId: conversations.data!.channel_id },
                })
              }
              style={({ pressed }) => [
                styles.listCard,
                stacked && styles.stacked,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.iconTile}>
                <Ionicons name="chatbubbles-outline" size={22} color={colors.blue} />
              </View>
              <View style={styles.itemBody}>
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
                {!!conversations.data.content && (
                  <Text numberOfLines={stacked ? undefined : 2} style={styles.meta}>
                    {conversations.data.content}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
          {conversations.data === null && !conversations.error && (
            <Text style={styles.meta}>Browse your chapter channels and join a conversation.</Text>
          )}
        </View>
        <View style={styles.section}>
          <SectionHeading
            title="Opportunities"
            label="Browse jobs"
            onPress={() => router.push({ pathname: '/people', params: { view: 'jobs' } })}
          />
          <ReadStatus tone="home" section={jobs} label="job opportunities" />
          {jobs.data?.map((job) => (
            <Pressable
              key={job.id}
              accessibilityRole="button"
              accessibilityLabel={`View job: ${job.title}, ${job.company}`}
              onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
              style={({ pressed }) => [
                styles.listCard,
                stacked && styles.stacked,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.iconTile}>
                <Ionicons name="briefcase-outline" size={22} color={colors.blue} />
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{job.title}</Text>
                <Text style={styles.meta}>
                  {[job.company, job.location].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.linkText}>View job</Text>
              </View>
            </Pressable>
          ))}
          {jobs.data?.length === 0 && !jobs.error && (
            <Text style={styles.meta}>No open opportunities yet.</Text>
          )}
        </View>
        <View style={styles.footer}>
          <Button
            tone="home"
            label="Explore your network"
            variant="ghost"
            onPress={() => router.push('/network')}
          />
          <Button
            tone="home"
            label="Alumni map · sharing is optional"
            variant="ghost"
            onPress={() => router.push('/map')}
          />
          <Button
            tone="home"
            label="View or complete your profile"
            variant="secondary"
            onPress={() => router.push('/me')}
          />
          {isAdmin(profile) && (
            <Button
              tone="home"
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.link}
      >
        <Text style={styles.linkText}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: 0,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: { ...homeTypography.page, color: colors.navy, flex: 1 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  identity: { gap: spacing.sm, padding: 20, backgroundColor: colors.blue },
  chapterIdentity: { gap: 8 },
  identityUniversity: { fontSize: 15, lineHeight: 23, color: colors.surface },
  identityMeta: { fontSize: 15, lineHeight: 23, color: colors.surface },
  identityStatus: { paddingHorizontal: 20 },
  eyebrow: { fontSize: 11, lineHeight: 17, fontWeight: '700', color: colors.goldLight },
  chapter: { ...homeTypography.page, color: colors.surface },
  membershipRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.gold },
  membershipCount: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 88,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 4,
  },
  membershipPressed: { backgroundColor: colors.goldLight },
  membershipNumber: { ...homeTypography.page, color: colors.navy, fontVariant: ['tabular-nums'] },
  membershipLabel: { ...typography.bodySmall, color: colors.navy, fontWeight: '600' },
  section: {
    gap: spacing.sm,
    padding: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: { ...homeTypography.section, color: colors.navy },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { ...typography.bodySmall, fontWeight: '600', color: colors.blue },
  eventTitle: { ...homeTypography.section, color: colors.blue },
  category: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: colors.navy },
  itemTitle: { ...typography.h3, lineHeight: 24, color: colors.navy },
  meta: { fontSize: 15, lineHeight: 21, color: colors.muted },
  mentorLink: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
  },
  eventCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
  },
  itemBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  eventAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 48,
    padding: spacing.md,
    backgroundColor: colors.blue,
  },
  primaryLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.surface,
    flexShrink: 1,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    minHeight: 70,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconTile: { padding: spacing.sm, borderRadius: 8, backgroundColor: colors.goldLight },
  stacked: { flexDirection: 'column' },
  pressed: { opacity: 0.8 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 20,
    gap: spacing.sm,
  },
});
