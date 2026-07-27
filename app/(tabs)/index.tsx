import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { useHomeData } from '@/lib/queries';
import { useInbox } from '@/lib/mentorship';
import { useEvents } from '@/lib/events';
import { Card } from '@/components/Card';
import { MemberCard } from '@/components/MemberCard';
import { StatPill } from '@/components/StatPill';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Button } from '@/components/Button';
import { InviteCard } from '@/components/InviteCard';
import { NextEventCard } from '@/components/NextEventCard';
import { ProfileNudgeCard } from '@/components/ProfileNudgeCard';
import { colors, radius, spacing, typography } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const { loading, error, stats, suggested, recent, reload } = useHomeData(
    profile?.chapter_id ?? null,
    session?.user?.id ?? null,
  );
  const { pendingIncoming } = useInbox(session?.user?.id ?? null);
  const {
    events,
    error: eventsError,
    reload: reloadEvents,
  } = useEvents(profile?.chapter_id ?? null);
  const nextEvent = events[0] ?? null;

  const onRefresh = useCallback(() => {
    reload();
    reloadEvents();
  }, [reload, reloadEvents]);

  const firstName =
    profile?.name?.split(' ')[0] ??
    (session?.user?.user_metadata?.name as string | undefined)?.split(' ')[0] ??
    'there';

  const go = useCallback(
    (href: Href) => {
      Haptics.selectionAsync().catch(() => {});
      router.push(href);
    },
    [router],
  );

  // No chapter yet → enter an invite code or start a new chapter.
  if (!profile?.chapter_id && !loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color={colors.gold} />
          <Text style={styles.emptyTitle}>You’re not in a chapter yet</Text>
          <Text style={styles.emptyBody}>
            Open an invite link from your chapter to join and unlock your network.
          </Text>
          <View style={styles.emptyActions}>
            <Button
              label="Enter an invite code"
              onPress={() => go('/onboarding/enter-code')}
            />
            <Button
              label="Create your chapter"
              variant="secondary"
              onPress={() => go('/onboarding/create-chapter')}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor={colors.gold}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name}>{firstName}</Text>
          </View>
          <Pressable
            onPress={() => go('/inbox')}
            hitSlop={12}
            style={styles.inboxBtn}
            accessibilityLabel="Open inbox"
          >
            <Ionicons name="mail-outline" size={24} color={colors.textPrimary} />
            {pendingIncoming > 0 && (
              <View style={styles.inboxBadge}>
                <Text style={styles.inboxBadgeText}>
                  {pendingIncoming > 9 ? '9+' : pendingIncoming}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Hero — Network Net Worth → full network breakdown */}
        <Card elevated style={styles.hero} onPress={() => go('/network')}>
          <Text style={styles.heroLabel}>Your Network</Text>
          <AnimatedNumber value={stats.members} style={styles.heroNumber} />
          <Text style={styles.heroSub}>
            {stats.members === 1 ? 'member' : 'members'} across {stats.industries}{' '}
            {stats.industries === 1 ? 'industry' : 'industries'}
          </Text>
          {stats.newThisMonth > 0 && (
            <View style={styles.heroPill}>
              <StatPill label={`${stats.newThisMonth} new this month`} positive />
            </View>
          )}
        </Card>

        {!!error && <Text style={styles.error}>Couldn’t load your network: {error}</Text>}

        {/* Profile nudge — shown while the profile is mostly empty. */}
        <ProfileNudgeCard profile={profile} />

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction
            icon="sparkles"
            label="Find a mentor"
            onPress={() => go({ pathname: '/people', params: { filter: 'mentors' } })}
          />
          <QuickAction
            icon="briefcase"
            label="Browse jobs"
            onPress={() => go({ pathname: '/people', params: { view: 'jobs' } })}
          />
          <QuickAction icon="chatbubbles" label="Open chat" onPress={() => go('/chats')} />
        </View>

        {/* Next event teaser — hidden entirely when there's nothing upcoming
            (or the events table doesn't exist yet / the fetch errored). */}
        {!eventsError && nextEvent && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Coming up</Text>
              <Pressable onPress={() => go('/(tabs)/events')} hitSlop={8}>
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            </View>
            <NextEventCard event={nextEvent} />
          </View>
        )}

        {/* Member invite loop — surfaced while the chapter is still small.
            (InviteCard renders null until its invite fetch resolves, so a
            brief mount while stats load shows nothing.) */}
        {stats.members < 15 && <InviteCard />}

        {/* Map preview → full Mapbox alumni map */}
        <Card style={styles.mapCard} onPress={() => go('/map')}>
          <View style={styles.mapIconWrap}>
            <Ionicons name="map" size={22} color={colors.gold} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.mapTitle}>Alumni map</Text>
            <Text style={styles.mapSub}>See where your network lives.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </Card>

        {/* Suggested connections */}
        {suggested.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>People you should know</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {suggested.map((p) => (
                <MemberCard
                  key={p.id}
                  profile={p}
                  variant="compact"
                  onPress={() => go({ pathname: '/profile/[id]', params: { id: p.id } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recent activity */}
        {recent.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <View style={styles.activityList}>
              {recent.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => go({ pathname: '/profile/[id]', params: { id: p.id } })}
                  style={({ pressed }) => [styles.activityRow, pressed && styles.activityPressed]}
                >
                  <Ionicons name="person-add" size={16} color={colors.green} />
                  <Text style={styles.activityText} numberOfLines={1}>
                    <Text style={styles.activityName}>{p.name ?? 'A new member'}</Text> joined
                    the chapter
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickPressed]}
    >
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color={colors.gold} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xl },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { ...typography.body, color: colors.textSecondary },
  name: { ...typography.h1, color: colors.textPrimary },

  inboxBtn: { padding: spacing.xs },
  inboxBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxBadgeText: { ...typography.caption, fontSize: 10, color: colors.background },

  hero: { alignItems: 'flex-start', paddingVertical: spacing.xl },
  heroLabel: { ...typography.heroLabel, color: colors.textSecondary },
  heroNumber: {
    ...typography.hero,
    color: colors.textPrimary,
    padding: 0,
    marginVertical: spacing.xs,
  },
  heroSub: { ...typography.bodySmall, color: colors.textSecondary },
  heroPill: { marginTop: spacing.md },

  error: { ...typography.bodySmall, color: colors.red },

  quickRow: { flexDirection: 'row', gap: spacing.md },
  quickAction: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  quickPressed: { backgroundColor: colors.surfaceHover, transform: [{ scale: 0.98 }] },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { ...typography.caption, color: colors.textPrimary, textAlign: 'center' },

  mapCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mapIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTitle: { ...typography.h3, color: colors.textPrimary },
  mapSub: { ...typography.bodySmall, color: colors.textSecondary },

  section: { gap: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  seeAll: { ...typography.bodySmall, color: colors.gold, fontWeight: '600' },
  rail: { gap: spacing.md, paddingRight: spacing.lg },

  activityList: { gap: spacing.sm },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  activityPressed: { opacity: 0.6 },
  activityText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  activityName: { color: colors.textPrimary, fontWeight: '600' },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  emptyActions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
});
