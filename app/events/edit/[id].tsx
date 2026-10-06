import { EventDateInput } from '@/components/EventDateInput';
import { localTimeZone, parseLocalDateTime, toLocalDateTimeFields } from '@/lib/time';
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useEvent, updateEvent, EVENT_CATEGORIES } from '@/lib/events';
import { isAdmin } from '@/lib/types';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { colors, spacing, typography } from '@/theme';
import type { EventCategory } from '@/lib/types';

export default function EventFormScreen() {
  const { session, profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EditEventForm
      key={JSON.stringify([session?.user.id, profile?.chapter_id, profile?.status, id])}
    />
  );
}

function EditEventForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile: me, blockedIds } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const { loading, event, error: loadError, reload } = useEvent(id ?? null, myUserId, blockedIds);

  const [entryZone] = useState(localTimeZone);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('chapter');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [occurrence, setOccurrence] = useState<string>();
  const [endOccurrence, setEndOccurrence] = useState<string>();
  const busy = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Prefill once from the loaded event (don't clobber in-progress edits on reload).
  useEffect(() => {
    if (!event || hydrated) return;
    const { date: d, time: t } = toLocalDateTimeFields(event.starts_at);
    setTitle(event.title);
    setCategory(event.category);
    setDate(d);
    setTime(t);
    if (event.ends_at) {
      const end = toLocalDateTimeFields(event.ends_at);
      setEndDate(end.date);
      setEndTime(end.time);
    }
    setLocation(event.location ?? '');
    setDescription(event.description ?? '');
    setHydrated(true);
  }, [event, hydrated]);

  const allowed = !!event && !!myUserId && (event.created_by === myUserId || isAdmin(me));

  async function submit() {
    if (busy.current || !live.current) return;
    if (!event || !allowed) return;
    setError(null);
    if (localTimeZone() !== entryZone) {
      setError(
        'Your device timezone changed. Reopen this form before saving so the displayed times are accurate.',
      );
      return;
    }
    if (!title.trim()) {
      setError('Give the event a title.');
      return;
    }
    const startsAt = parseLocalDateTime(date, time, event.starts_at, occurrence);
    if (!startsAt) {
      setError(
        'Choose a valid local date and time. Times skipped by daylight saving are invalid; repeated times need an occurrence.',
      );
      return;
    }

    const endsAt =
      endDate || endTime
        ? parseLocalDateTime(endDate, endTime, event.ends_at, endOccurrence)
        : null;
    if ((endDate || endTime) && (!endsAt || +endsAt <= +startsAt)) {
      setError('Choose a valid end time after the start, or clear both end fields.');
      return;
    }
    busy.current = true;
    setSubmitting(true);
    const { error: err } = await updateEvent(event.id, {
      title: title.trim(),
      category,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      location: location.trim() || null,
      description: description.trim() || null,
    });
    busy.current = false;
    if (!live.current) return;
    setSubmitting(false);

    if (err) {
      setError(err);
      return;
    }
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Edit event" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !event ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{loadError ?? 'This event is removed or unavailable.'}</Text>
          {!!loadError && <Button label="Retry" onPress={reload} />}
        </View>
      ) : !allowed ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Only the event’s creator or a chapter admin can edit it.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextField
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="Chapter meeting"
            />

            <Text style={styles.chipsLabel}>Category</Text>
            <View style={styles.chips}>
              {EVENT_CATEGORIES.map((cat) => (
                <Chip
                  key={cat.value}
                  label={cat.label}
                  selected={category === cat.value}
                  onPress={() => setCategory(cat.value)}
                />
              ))}
            </View>

            <EventDateInput
              timeZone={entryZone}
              label="Start"
              date={date}
              time={time}
              onDate={setDate}
              onTime={setTime}
              occurrence={occurrence}
              onOccurrence={setOccurrence}
              original={event.starts_at}
            />
            <EventDateInput
              timeZone={entryZone}
              label="End (optional)"
              optional
              date={endDate}
              time={endTime}
              onDate={setEndDate}
              onTime={setEndTime}
              occurrence={endOccurrence}
              onOccurrence={setEndOccurrence}
              original={event.ends_at}
            />
            <Text style={styles.mutedNote}>
              No end time? The event leaves Upcoming at its start. Share any updates in an existing
              chat.
            </Text>
            <TextField
              label="Location"
              value={location}
              onChangeText={setLocation}
              placeholder="Chapter house"
            />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="What’s happening, and who should come?"
              multiline
              numberOfLines={4}
              style={styles.multiline}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Button label="Save changes" onPress={submit} loading={submitting} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mutedNote: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg },
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  chipsLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  multiline: { height: 110, textAlignVertical: 'top' },
  error: { ...typography.bodySmall, color: colors.red, marginBottom: spacing.lg },
});
