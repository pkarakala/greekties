import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  type PressableProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { eventClockTime, eventPhase } from '@/lib/time';
import { EVENT_CATEGORIES, type EventWithMeta } from '@/lib/events';
import { EventDateTile } from './EventDateTile';
import { eventColors, eventTypography } from '@/theme/events-rebrand';
import { spacing } from '@/theme';

interface EventCardProps {
  event: EventWithMeta;
  onPress?: PressableProps['onPress'];
}

/** Full-length agenda row; counts include only RSVPs visible to this member. */
export function EventCard({ event, onPress }: EventCardProps) {
  const { fontScale } = useWindowDimensions();
  const response =
    event.myStatus === 'going'
      ? 'You’re going'
      : event.myStatus === 'maybe'
        ? 'You’re interested'
        : event.myStatus === 'declined'
          ? 'You can’t go'
          : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        fontScale >= 1.5 && styles.stacked,
        pressed && styles.pressed,
      ]}
    >
      <EventDateTile tone="home" startsAt={event.starts_at} />
      <View style={[styles.content, fontScale >= 1.5 && styles.stackedContent]}>
        <Text style={styles.meta}>
          {EVENT_CATEGORIES.find((category) => category.value === event.category)?.label}
          {' · '}
          {eventPhase(event)}
        </Text>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.support}>{eventClockTime(event.starts_at)}</Text>
        {!!event.location && <Text style={styles.support}>{event.location}</Text>}
        <Text style={styles.attendance}>
          {event.goingCount === null
            ? 'Attendance unavailable'
            : `${event.goingCount} going · visible to you`}
          {event.metaError && event.goingCount !== null ? ' · Refresh unavailable' : ''}
        </Text>
        {response && (
          <View style={styles.response}>
            <Ionicons
              name={event.myStatus === 'going' ? 'checkmark' : 'time-outline'}
              size={16}
              color={eventColors.action}
            />
            <Text style={styles.responseText}>{response}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: eventColors.divider,
    backgroundColor: eventColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: eventColors.divider,
  },
  stacked: { flexDirection: 'column' },
  stackedContent: { flex: 0 },
  pressed: { backgroundColor: eventColors.soft },
  content: { flex: 1, minWidth: 0, gap: spacing.xs, alignSelf: 'stretch' },
  title: { ...eventTypography.section, color: eventColors.action },
  meta: { ...eventTypography.meta, color: eventColors.muted },
  support: { ...eventTypography.support, color: eventColors.muted },
  attendance: { ...eventTypography.meta, color: eventColors.muted, marginTop: spacing.xs },
  response: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  responseText: {
    ...eventTypography.meta,
    color: eventColors.action,
    fontWeight: '600',
    flexShrink: 1,
  },
});
