import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from './Card';
import { Badge } from './Badge';
import { clockTime } from '@/lib/time';
import { colors, radius, spacing, typography } from '@/theme';
import type { Event, EventCategory } from '@/lib/types';

const CATEGORY_LABELS: Record<EventCategory, string> = {
  chapter: 'Chapter',
  alumni: 'Alumni',
  philanthropy: 'Philanthropy',
  social: 'Social',
  recruitment: 'Recruitment',
};

interface NextEventCardProps {
  event: Event;
}

/** Home teaser for the next upcoming event — date block, title, time + place. */
export function NextEventCard({ event }: NextEventCardProps) {
  const router = useRouter();

  const starts = new Date(event.starts_at);
  const valid = !Number.isNaN(starts.getTime());
  const month = valid
    ? starts.toLocaleDateString([], { month: 'short' }).toUpperCase()
    : '';
  const day = valid ? String(starts.getDate()) : '–';

  const meta = [clockTime(event.starts_at), event.location]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card
      style={styles.card}
      onPress={() =>
        router.push({ pathname: '/events/[id]', params: { id: event.id } })
      }
    >
      <View style={styles.dateBlock}>
        <Text style={styles.dateMonth}>{month}</Text>
        <Text style={styles.dateDay}>{day}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>
        {!!meta && (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        )}
        <Badge label={CATEGORY_LABELS[event.category]} tone="gold" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateBlock: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMonth: { ...typography.caption, fontSize: 10, color: colors.gold },
  dateDay: { ...typography.h3, color: colors.gold },
  body: { flex: 1, gap: spacing.xs },
  title: { ...typography.h3, color: colors.textPrimary },
  meta: { ...typography.bodySmall, color: colors.textSecondary },
});
