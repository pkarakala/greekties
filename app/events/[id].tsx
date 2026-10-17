import { ShareToChat } from '@/components/ShareToChat';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useEvent, useEventClock, deleteEvent, eventDayKey } from '@/lib/events';
import { isAdmin } from '@/lib/types';
import type { EventCategory, RsvpStatus } from '@/lib/types';
import { eventDateTime, eventClockTime, eventPhase } from '@/lib/time';
import { EventDateTile } from '@/components/EventDateTile';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { spacing } from '@/theme';
import { eventColors, eventTypography } from '@/theme/events-rebrand';

const CATEGORY_LABELS: Record<EventCategory, string> = {
  chapter: 'Chapter',
  alumni: 'Alumni',
  philanthropy: 'Philanthropy',
  social: 'Social',
  recruitment: 'Recruitment',
};

const RSVP_OPTIONS: readonly { status: RsvpStatus; label: string }[] = [
  { status: 'going', label: 'Going' },
  { status: 'maybe', label: 'Interested' },
  { status: 'declined', label: 'Can’t go' },
] as const;

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile, blockedIds } = useAuth();
  return (
    <EventDetailContent
      key={JSON.stringify([
        id,
        session?.user.id,
        profile?.chapter_id,
        profile?.status,
        profile?.admin_role,
        [...blockedIds].sort(),
      ])}
    />
  );
}
function EventDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile: me, blockedIds } = useAuth();
  const myUserId = session?.user?.id ?? null;
  const { width, fontScale } = useWindowDimensions();
  // Keep the full labels readable as text grows instead of squeezing three columns.
  const stackRsvp = width < 360 || fontScale >= 1.2;

  const {
    loading,
    error,
    event,
    goingCount,
    maybeCount,
    myStatus,
    creator,
    reload,
    metaError,
    attendees,
    attendeeState,
    recoveryMessage,
    saving,
    saveError,
    saveRsvp,
  } = useEvent(id ?? null, myUserId, blockedIds);
  const now = useEventClock(event ? [event] : []);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const guard = useRef(false);
  const live = useRef(true);
  const focusVersion = useRef(0);
  const confirmRef = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
      return () => {
        focusVersion.current++;
        confirmRef.current = false;
        setConfirmation(false);
      };
    }, [reload]),
  );
  useEffect(() => {
    if (loading || error || !event) {
      confirmRef.current = false;
      setConfirmation(false);
    }
  }, [loading, error, event]);
  const canManage =
    !!event &&
    !!myUserId &&
    me?.status === 'approved' &&
    (event.created_by === myUserId || isAdmin(me));
  async function confirmDelete() {
    if (!event || !canManage || !live.current || !confirmRef.current || guard.current) return;
    guard.current = true;
    confirmRef.current = false;
    setDeleting(true);
    const focus = focusVersion.current;
    const result = await deleteEvent(event.id);
    if (!live.current) return;
    guard.current = false;
    setDeleting(false);
    setConfirmation(false);
    if (focus !== focusVersion.current) return;
    if (result.error) setDeleteError(result.error);
    else router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={24} color={eventColors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Event</Text>
      </View>
      {loading && !event ? (
        <View style={styles.center}>
          <ActivityIndicator color={eventColors.action} accessibilityLabel="Loading event" />
          <Text style={styles.muted}>Loading event…</Text>
        </View>
      ) : !event ? (
        <ScrollView contentContainerStyle={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={28} color={eventColors.action} />
          </View>
          <Text accessibilityRole="header" style={styles.emptyTitle}>
            {error ? 'Event couldn’t load' : 'Event unavailable'}
          </Text>
          <Text accessibilityRole={error ? 'alert' : undefined} style={styles.emptyText}>
            {error
              ? `${error} This does not mean the event was deleted.`
              : 'This event is removed or unavailable.'}
          </Text>
          {!!error && <Button tone="home" label="Retry" variant="secondary" onPress={reload} />}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.banner, fontScale >= 1.5 && styles.largeBanner]}>
            <EventDateTile
              tone="home"
              startsAt={event.starts_at}
              prominent
              compact={fontScale >= 1.5}
            />
            <View style={[styles.bannerCopy, fontScale >= 1.5 && styles.largeBannerCopy]}>
              <Text style={styles.bannerTitle}>{CATEGORY_LABELS[event.category]} event</Text>
              <Text style={styles.bannerMeta}>
                {eventPhase(event, now)}
                {!event.ends_at && eventPhase(event, now) === 'Ended'
                  ? ' · Start has passed; no end time provided'
                  : ''}
              </Text>
            </View>
          </View>
          {!!error && (
            <View style={styles.notice}>
              <Text accessibilityRole="alert" style={styles.error}>
                {error} Showing saved details.
              </Text>
            </View>
          )}
          {loading && (
            <Text accessibilityLiveRegion="polite" style={styles.muted}>
              Refreshing…
            </Text>
          )}
          <Text
            accessibilityRole="header"
            lineBreakStrategyIOS="standard"
            textBreakStrategy="highQuality"
            style={[styles.title, fontScale >= 1.5 && styles.largeTitle]}
          >
            {event.title}
          </Text>
          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={22} color={eventColors.muted} />
              <View style={styles.flex}>
                <Text style={styles.factText}>
                  {new Date(event.starts_at).toLocaleDateString([], {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
                <Text style={styles.metaText}>
                  {eventClockTime(event.starts_at)}
                  {event.ends_at
                    ? ` – ${eventDayKey(event.starts_at) === eventDayKey(event.ends_at) ? eventClockTime(event.ends_at) : eventDateTime(event.ends_at)}`
                    : ' · No end time provided'}
                </Text>
              </View>
            </View>
            {!!event.location && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={22} color={eventColors.muted} />
                <Text style={[styles.factText, styles.flex]}>{event.location}</Text>
              </View>
            )}
          </View>
          {!!creator && (
            <Pressable
              style={({ pressed }) => [styles.creator, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`View ${creator.name ?? 'creator'} profile`}
              onPress={() => router.push({ pathname: '/profile/[id]', params: { id: creator.id } })}
            >
              <Avatar tone="home" uri={creator.avatar_url} name={creator.name} size="sm" />
              <View style={styles.flex}>
                <Text style={styles.metaText}>Created by</Text>
                <Text style={styles.factText}>{creator.name ?? 'Member'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={eventColors.muted} />
            </Pressable>
          )}
          <View style={styles.attendance}>
            <Text style={styles.metaText}>
              {goingCount === null
                ? 'Attendance unavailable'
                : `${goingCount} going · ${maybeCount} interested · RSVPs visible to you`}
            </Text>
            {!!metaError && (
              <Text style={styles.muted}>
                {metaError}
                {goingCount !== null ? ' Showing previous attendance.' : ''}
              </Text>
            )}
            {!!recoveryMessage && (
              <Text accessibilityLiveRegion="polite" style={styles.metaText}>
                {recoveryMessage}
              </Text>
            )}
            {!!saveError && (
              <View style={styles.notice}>
                <Text accessibilityRole="alert" style={styles.error}>
                  {saveError}
                </Text>
              </View>
            )}
            {(error || metaError || saveError) && (
              <Button
                tone="home"
                label="Retry attendance and details"
                onPress={reload}
                disabled={saving}
                variant="secondary"
              />
            )}
          </View>
          {!!event.description && (
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Details
              </Text>
              <Text style={styles.body}>{event.description}</Text>
            </View>
          )}
          {
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Guests visible to you
              </Text>
              {attendeeState === 'loading' && (
                <Text accessibilityLiveRegion="polite" style={styles.metaText}>
                  Loading guest preview…
                </Text>
              )}
              {attendeeState === 'error' && (
                <Text accessibilityRole="alert" style={styles.metaText}>
                  Guest preview couldn’t refresh. Retry to check again.
                </Text>
              )}
              {attendeeState === 'ready' &&
                attendees.filter((a) => !blockedIds.has(a.user_id)).length === 0 && (
                  <Text style={styles.metaText}>No guest profiles are visible to you.</Text>
                )}
              <View style={styles.attendees}>
                {attendees
                  .filter((a) => !blockedIds.has(a.user_id))
                  .slice(0, 4)
                  .map((a) => (
                    <View key={a.id} style={styles.attendee}>
                      <Avatar tone="home" uri={a.avatar_url} name={a.name} size="sm" />
                      <Text style={styles.metaText}>{a.name ?? 'Member'}</Text>
                    </View>
                  ))}
              </View>
            </View>
          }
          <ShareToChat resource={{ kind: 'events', id: event.id }} tone="home" />
          {canManage && (
            <View style={styles.manage}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Manage event
              </Text>
              <Button
                tone="home"
                disabled={deleting || loading || !!error}
                label="Edit event"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/events/edit/[id]', params: { id: event.id } })
                }
              />
              {!!deleteError && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {deleteError}
                </Text>
              )}
              {confirmation && (
                <View style={styles.section}>
                  <Text style={styles.muted}>Delete this event and all its RSVPs permanently?</Text>
                  <Button
                    tone="home"
                    label="Cancel deletion"
                    variant="secondary"
                    disabled={deleting}
                    onPress={() => {
                      confirmRef.current = false;
                      setConfirmation(false);
                    }}
                  />
                  <Button
                    tone="home"
                    label="Permanently delete event"
                    loading={deleting}
                    onPress={confirmDelete}
                  />
                </View>
              )}
              <Button
                tone="home"
                label="Delete event"
                disabled={loading || !!error}
                variant="ghost"
                onPress={() => {
                  confirmRef.current = true;
                  setConfirmation(true);
                }}
                loading={deleting}
              />
            </View>
          )}
        </ScrollView>
      )}
      {!!event && (
        <View testID="event-rsvp-dock" style={styles.dock}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Are you going?
          </Text>
          <View style={styles.rsvpRow}>
            {RSVP_OPTIONS.map((opt) => (
              <View key={opt.status} style={[styles.rsvpButton, stackRsvp && styles.stackedRsvp]}>
                <Button
                  tone="home"
                  compact
                  label={opt.label}
                  variant={myStatus === opt.status ? 'primary' : 'secondary'}
                  accessibilityState={{ selected: myStatus === opt.status, busy: saving }}
                  onPress={() => void saveRsvp(opt.status)}
                  disabled={saving || deleting || loading || !!error || myStatus === undefined}
                />
              </View>
            ))}
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.metaText}>
            {myStatus === undefined
              ? 'Your response is unavailable.'
              : myStatus === null
                ? 'You haven’t responded yet.'
                : `Your response: ${RSVP_OPTIONS.find((option) => option.status === myStatus)?.label}`}
          </Text>
          {saving && (
            <Text accessibilityLiveRegion="polite" style={styles.muted}>
              Saving your response…
            </Text>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: eventColors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: eventColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: eventColors.divider,
  },
  back: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  pressed: { backgroundColor: eventColors.soft },
  headerTitle: { ...eventTypography.support, fontWeight: '600', color: eventColors.text, flex: 1 },
  flex: { flex: 1 },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  emptyIcon: { backgroundColor: eventColors.soft, borderRadius: 8, padding: spacing.md },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    color: eventColors.text,
    textAlign: 'center',
  },
  emptyText: { ...eventTypography.body, color: eventColors.muted, textAlign: 'center' },
  muted: { ...eventTypography.support, color: eventColors.muted },
  scroll: {
    padding: 20,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: eventColors.surface,
    borderWidth: 1,
    borderColor: eventColors.divider,
    borderRadius: 8,
  },
  largeBanner: {
    gap: spacing.md,
    padding: spacing.md,
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  largeBannerCopy: { paddingLeft: 0, borderLeftWidth: 0, flex: 0 },
  bannerCopy: {
    flex: 1,
    gap: spacing.xs,
    borderLeftWidth: 1,
    borderLeftColor: eventColors.divider,
    paddingLeft: spacing.lg,
  },
  bannerTitle: { fontSize: 15, lineHeight: 23, fontWeight: '600', color: eventColors.text },
  bannerMeta: { ...eventTypography.meta, color: eventColors.muted },
  title: { ...eventTypography.title, color: eventColors.text },
  // A smaller base heading at accessibility sizes leaves room for whole words.
  // Dynamic Type remains enabled with no maximum multiplier or line limit.
  largeTitle: { fontSize: 22, lineHeight: 28 },
  meta: { gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  factText: { ...eventTypography.support, color: eventColors.text },
  metaText: { ...eventTypography.meta, color: eventColors.muted },
  section: { gap: spacing.sm },
  sectionTitle: { ...eventTypography.section, color: eventColors.text },
  body: { ...eventTypography.body, color: eventColors.text },
  dock: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: eventColors.soft,
    borderTopWidth: 2,
    borderTopColor: eventColors.accent,
  },
  attendance: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: eventColors.divider,
  },
  rsvpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rsvpButton: { flexGrow: 1, flexBasis: 95 },
  stackedRsvp: { flexBasis: '100%' },
  creator: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  attendees: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  attendee: { gap: spacing.xs, flexShrink: 1 },
  manage: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: eventColors.divider,
  },
  notice: {
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: eventColors.error,
    backgroundColor: eventColors.errorSurface,
  },
  error: { ...eventTypography.support, color: eventColors.error },
});
