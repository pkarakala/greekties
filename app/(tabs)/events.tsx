import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useEvents, EVENT_CATEGORIES, eventDayKey, eventDayLabel } from '@/lib/events';
import type { EventWithMeta } from '@/lib/events';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { EventCard } from '@/components/EventCard';
import { colors, spacing, typography } from '@/theme';
import type { EventCategory } from '@/lib/types';

interface DaySection {
  title: string;
  data: EventWithMeta[];
}

export default function EventsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const chapterId = profile?.chapter_id ?? null;
  const { loading, error, events, reload } = useEvents(chapterId);

  // Layered category filters — empty selection shows everything.
  const [selected, setSelected] = useState<Set<EventCategory>>(new Set());

  const toggleCategory = useCallback((category: EventCategory) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  // Refresh when returning from the create form or a detail screen.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const sections = useMemo<DaySection[]>(() => {
    const filtered =
      selected.size === 0 ? events : events.filter((e) => selected.has(e.category));

    const byDay = new Map<string, DaySection>();
    for (const event of filtered) {
      const key = eventDayKey(event.starts_at);
      const existing = byDay.get(key);
      if (existing) existing.data.push(event);
      else byDay.set(key, { title: eventDayLabel(event.starts_at), data: [event] });
    }
    // Events arrive sorted by starts_at ascending, so insertion order is
    // already chronological.
    return [...byDay.values()];
  }, [events, selected]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Events"
        right={{ icon: 'add', onPress: () => router.push('/events/new') }}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() =>
              router.push({ pathname: '/events/[id]', params: { id: item.id } })
            }
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.gold} />
        }
        ListHeaderComponent={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {EVENT_CATEGORIES.map((cat) => (
              <Chip
                key={cat.value}
                label={cat.label}
                selected={selected.has(cat.value)}
                onPress={() => toggleCategory(cat.value)}
              />
            ))}
          </ScrollView>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {error ??
                  (selected.size > 0
                    ? 'No upcoming events match your filters.'
                    : 'No upcoming events. Get something on the calendar.')}
              </Text>
              <Button
                label="Create an event"
                fullWidth={false}
                onPress={() => router.push('/events/new')}
              />
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  chips: { gap: spacing.sm, paddingRight: spacing.lg, paddingBottom: spacing.sm },
  sectionHeader: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  empty: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xxxl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
