import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useEvent, rsvp, deleteEvent } from '@/lib/events';
import { isAdmin } from '@/lib/types';
import type { EventCategory, RsvpStatus } from '@/lib/types';
import { clockTime } from '@/lib/time';
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
  { status: 'maybe', label: 'Maybe' },
  { status: 'declined', label: 'Can’t go' },
] as const;

/** Full date line: "Mon, Aug 3 · 7:00 PM". */
function eventDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${day} · ${clockTime(iso)}`;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile: me } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const { loading, error, event, goingCount, maybeCount, myStatus, creator, reload } =
    useEvent(id ?? null, myUserId);

  // Optimistic RSVP: reflect the tap immediately, roll back on failure.
  const [localStatus, setLocalStatus] = useState<RsvpStatus | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLocalStatus(myStatus);
  }, [myStatus]);

  // Refresh when returning from the edit screen so saved changes show.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const canManage = !!event && !!myUserId && (event.created_by === myUserId || isAdmin(me));

  async function setRsvp(status: RsvpStatus) {
    if (!event || !myUserId) return;
    const previous = localStatus;
    setLocalStatus(status);
    const { error: err } = await rsvp(event.id, myUserId, status);
    if (err) {
      setLocalStatus(previous);
      Alert.alert('Couldn’t save your RSVP', err);
      return;
    }
    reload();
  }

  function confirmDelete() {
    if (!event) return;
    Alert.alert('Delete event?', 'This permanently removes the event and all RSVPs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const { error: err } = await deleteEvent(event.id);
          setDeleting(false);
          if (err) Alert.alert('Couldn’t delete', err);
          else router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !event ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error ?? 'This event couldn’t be found.'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Badge label={CATEGORY_LABELS[event.category]} tone="gold" />
          <Text style={styles.title}>{event.title}</Text>

          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.metaText}>{eventDateTime(event.starts_at)}</Text>
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
                    variant={localStatus === opt.status ? 'primary' : 'secondary'}
                    onPress={() => void setRsvp(opt.status)}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.counts}>
              {goingCount} going · {maybeCount} maybe
            </Text>
          </View>

          {!!event.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Details</Text>
              <Text style={styles.body}>{event.description}</Text>
            </View>
          )}

          {!!creator && (
            <Pressable
              style={styles.creator}
              onPress={() =>
                router.push({ pathname: '/profile/[id]', params: { id: creator.id } })
              }
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
                label="Edit event"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/events/edit/[id]', params: { id: event.id } })
                }
              />
              <Button
                label="Delete event"
                variant="ghost"
                onPress={confirmDelete}
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
  rsvpRow: { flexDirection: 'row', gap: spacing.sm },
  rsvpButton: { flex: 1 },
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
