import { ShareToChat } from '@/components/ShareToChat';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useEvent, useEventClock, deleteEvent } from '@/lib/events';
import { isAdmin } from '@/lib/types';
import type { EventCategory, RsvpStatus } from '@/lib/types';
import { eventDateTime, eventPhase } from '@/lib/time';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { colors, radius, spacing, typography } from '@/theme';

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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="" onBack={() => router.back()} />

      {loading && !event ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !event ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error ?? 'This event is removed or unavailable.'}</Text>
          {!!error && <Button label="Retry" onPress={reload} />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Badge label={CATEGORY_LABELS[event.category]} tone="gold" />
          <Text style={styles.metaText}>
            {eventPhase(event, now)}
            {!event.ends_at && eventPhase(event, now) === 'Ended'
              ? ' · Start has passed; no end time provided'
              : ''}
          </Text>
          {!!error && <Text style={styles.muted}>{error} Showing saved details.</Text>}
          {loading && <Text style={styles.muted}>Refreshing…</Text>}
          <Text style={styles.title}>{event.title}</Text>

          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.metaText}>
                {eventDateTime(event.starts_at)}
                {event.ends_at ? ` – ${eventDateTime(event.ends_at)}` : ' · No end time provided'}
              </Text>
            </View>
            {!!event.location && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={15} color={colors.textTertiary} />
                <Text style={styles.metaText}>{event.location}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Are you going?</Text>
            <View style={styles.rsvpRow}>
              {RSVP_OPTIONS.map((opt) => (
                <View key={opt.status} style={styles.rsvpButton}>
                  <Button
                    label={opt.label}
                    variant={myStatus === opt.status ? 'primary' : 'secondary'}
                    onPress={() => void saveRsvp(opt.status)}
                    disabled={saving || deleting || loading || !!error || myStatus === undefined}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.counts}>
              {goingCount === null
                ? 'Attendance unavailable'
                : `${goingCount} going · ${maybeCount} interested · RSVPs visible to you`}
            </Text>
            {myStatus !== undefined && (
              <Text style={styles.muted}>
                {myStatus === null
                  ? 'You haven’t responded yet.'
                  : `Your response: ${RSVP_OPTIONS.find((option) => option.status === myStatus)?.label}`}
              </Text>
            )}
            {myStatus === undefined && (
              <Text style={styles.muted}>Your response is unavailable.</Text>
            )}
            {!!metaError && (
              <Text style={styles.muted}>
                {metaError}
                {goingCount !== null ? ' Showing previous attendance.' : ''}
              </Text>
            )}
            {!!saveError && (
              <Text accessibilityRole="alert" style={styles.muted}>
                {saveError}
              </Text>
            )}
            {(error || metaError || saveError) && (
              <Button
                label="Retry attendance and details"
                onPress={reload}
                disabled={saving}
                variant="secondary"
              />
            )}
            {saving && <Text style={styles.muted}>Saving your response…</Text>}
            <View style={styles.attendees}>
              {attendees
                .filter((a) => !blockedIds.has(a.user_id))
                .slice(0, 4)
                .map((a) => (
                  <View key={a.id} style={styles.attendee}>
                    <Avatar uri={a.avatar_url} name={a.name} size="sm" />
                    <Text style={styles.metaText}>{a.name ?? 'Member'}</Text>
                  </View>
                ))}
            </View>
          </View>

          <ShareToChat resource={{ kind: 'events', id: event.id }} />

          {!!event.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Details</Text>
              <Text style={styles.body}>{event.description}</Text>
            </View>
          )}

          {!!creator && (
            <Pressable
              style={styles.creator}
              accessibilityRole="button"
              accessibilityLabel={`View ${creator.name ?? 'creator'} profile`}
              onPress={() => router.push({ pathname: '/profile/[id]', params: { id: creator.id } })}
            >
              <Avatar uri={creator.avatar_url} name={creator.name} size="sm" />
              <View style={styles.flex}>
                <Text style={styles.creatorLabel}>Created by</Text>
                <Text style={styles.creatorName}>{creator.name ?? 'Member'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          )}

          {canManage && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Manage event</Text>
              <Button
                disabled={deleting || loading || !!error}
                label="Edit event"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/events/edit/[id]', params: { id: event.id } })
                }
              />
              {!!deleteError && (
                <Text accessibilityRole="alert" style={styles.muted}>
                  {deleteError}
                </Text>
              )}
              {confirmation && (
                <View style={styles.section}>
                  <Text style={styles.muted}>Delete this event and all its RSVPs permanently?</Text>
                  <Button
                    label="Cancel deletion"
                    variant="secondary"
                    disabled={deleting}
                    onPress={() => {
                      confirmRef.current = false;
                      setConfirmation(false);
                    }}
                  />
                  <Button
                    label="Permanently delete event"
                    loading={deleting}
                    onPress={confirmDelete}
                  />
                </View>
              )}
              <Button
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  attendees: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  attendee: { gap: spacing.xs, maxWidth: 140 },
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.body, color: colors.textSecondary },
  scroll: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  title: { ...typography.h1, color: colors.textPrimary },
  meta: { gap: spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { ...typography.bodySmall, color: colors.textSecondary },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  rsvpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rsvpButton: { flexGrow: 1, flexBasis: 100 },
  counts: { ...typography.caption, color: colors.textTertiary },
  creator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  creatorLabel: { ...typography.caption, color: colors.textTertiary },
  creatorName: { ...typography.h3, color: colors.textPrimary },
});
