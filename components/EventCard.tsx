import { View, Text, StyleSheet, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Badge } from './Badge';
import { clockTime } from '@/lib/time';
import { colors, spacing, typography } from '@/theme';
import type { EventWithMeta } from '@/lib/events';
import type { EventCategory } from '@/lib/types';

const CATEGORY_LABELS: Record<EventCategory, string> = {
  chapter: 'Chapter',
  alumni: 'Alumni',
  philanthropy: 'Philanthropy',
  social: 'Social',
  recruitment: 'Recruitment',
};

interface EventCardProps {
  event: EventWithMeta;
  onPress?: PressableProps['onPress'];
}

/** Agenda row: time, title, location, category badge, going count. */
export function EventCard({ event, onPress }: EventCardProps) {
  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.top}>
        <Text style={styles.time}>{clockTime(event.starts_at)}</Text>
        <Badge label={CATEGORY_LABELS[event.category]} tone="gold" />
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {event.title}
      </Text>

      <View style={styles.meta}>
        {!!event.location && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}
        {event.goingCount > 0 && (
          <View style={styles.metaItem}>
            <Ionicons name="people-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>
              {event.goingCount} going
            </Text>
          </View>
        )}
        {event.myStatus === 'going' && (
          <Badge label="You’re going" tone="green" />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { ...typography.caption, color: colors.gold },
  title: { ...typography.h3, color: colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { ...typography.caption, color: colors.textTertiary },
});
