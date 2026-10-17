import { useCallback, useMemo, useState } from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useEvents, EVENT_CATEGORIES, eventDayKey, eventDayLabel } from '@/lib/events';
import type { EventWithMeta } from '@/lib/events';
import { localTimeZone } from '@/lib/time';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { EventCard } from '@/components/EventCard';
import { spacing } from '@/theme';
import { eventColors, eventTypography } from '@/theme/events-rebrand';
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
  // Preserve the existing multi-select category filters. All clears them.
  const [selected, setSelected] = useState<Set<EventCategory>>(new Set());
  const toggleCategory = useCallback((category: EventCategory) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const sections = useMemo<DaySection[]>(() => {
    const filtered = selected.size === 0 ? events : events.filter((e) => selected.has(e.category));
    const byDay = new Map<string, DaySection>();
    for (const event of filtered) {
      const key = eventDayKey(event.starts_at);
      const existing = byDay.get(key);
      if (existing) existing.data.push(event);
      else byDay.set(key, { title: eventDayLabel(event.starts_at), data: [event] });
    }
    return [...byDay.values()];
  }, [events, selected]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text accessibilityRole="header" style={styles.title}>
            Events
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create event"
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            onPress={() => router.push('/events/new')}
          >
            <Ionicons name="add" size={24} color={eventColors.text} />
          </Pressable>
        </View>
        <Text style={styles.meta}>Upcoming chapter events</Text>
      </View>
      <View style={styles.filters}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="All"
            selected={selected.size === 0}
            tone="home"
            onPress={() => setSelected(new Set())}
          />
          {EVENT_CATEGORIES.map((cat) => (
            <Chip
              key={cat.value}
              label={cat.label}
              selected={selected.has(cat.value)}
              tone="home"
              onPress={() => toggleCategory(cat.value)}
            />
          ))}
        </ScrollView>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => router.push({ pathname: '/events/[id]', params: { id: item.id } })}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={styles.sectionHeader}>
            {section.title}
          </Text>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={eventColors.action} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.agendaHeading}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Upcoming
              </Text>
              <Text style={styles.meta}>Times in {localTimeZone().replaceAll('_', ' ')}</Text>
            </View>
            {!!error && events.length > 0 && (
              <View style={styles.notice}>
                <Text accessibilityRole="alert" style={styles.error}>
                  {error} Previously loaded information may be shown.
                </Text>
                <Button
                  tone="home"
                  label="Retry"
                  variant="secondary"
                  disabled={loading}
                  onPress={reload}
                />
              </View>
            )}
            {loading && events.length > 0 && (
              <Text accessibilityLiveRegion="polite" style={styles.refreshing}>
                Refreshing events…
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={eventColors.action} accessibilityLabel="Loading events" />
              <Text style={styles.emptyText}>Loading events…</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="calendar-outline" size={28} color={eventColors.action} />
              </View>
              <Text accessibilityRole="header" style={styles.emptyTitle}>
                {error
                  ? 'Events couldn’t load'
                  : selected.size > 0
                    ? 'No matching events'
                    : 'Nothing on the calendar yet'}
              </Text>
              <Text accessibilityRole={error ? 'alert' : undefined} style={styles.emptyText}>
                {error ??
                  (selected.size > 0
                    ? 'Try another category or clear your filters.'
                    : 'Create a chapter event to bring members together.')}
              </Text>
              {error ? (
                <Button tone="home" label="Retry" variant="secondary" onPress={reload} />
              ) : (
                <>
                  {selected.size > 0 && (
                    <Button
                      tone="home"
                      label="Clear filters"
                      variant="secondary"
                      onPress={() => setSelected(new Set())}
                    />
                  )}
                  <Button
                    tone="home"
                    label="Create an event"
                    onPress={() => router.push('/events/new')}
                  />
                </>
              )}
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: eventColors.canvas },
  header: {
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: eventColors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { ...eventTypography.title, color: eventColors.text, flex: 1 },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: eventColors.accent,
  },
  pressed: { backgroundColor: eventColors.soft },
  filters: {
    backgroundColor: eventColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: eventColors.divider,
  },
  chips: { gap: spacing.sm, padding: 20 },
  list: { paddingBottom: spacing.xxl },
  agendaHeading: { padding: 20, gap: spacing.xs },
  sectionTitle: { ...eventTypography.section, color: eventColors.text },
  sectionHeader: {
    ...eventTypography.section,
    color: eventColors.text,
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  meta: { ...eventTypography.meta, color: eventColors.muted },
  empty: { alignItems: 'center', gap: spacing.lg, padding: spacing.xl, paddingTop: spacing.xxxl },
  emptyIcon: { padding: spacing.md, borderRadius: 8, backgroundColor: eventColors.soft },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    color: eventColors.text,
    textAlign: 'center',
  },
  emptyText: { ...eventTypography.body, color: eventColors.muted, textAlign: 'center' },
  notice: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: eventColors.error,
    backgroundColor: eventColors.errorSurface,
  },
  error: { ...eventTypography.support, color: eventColors.error },
  refreshing: {
    ...eventTypography.support,
    color: eventColors.muted,
    paddingHorizontal: 20,
    paddingBottom: spacing.sm,
  },
});
