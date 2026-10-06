import { EventDateInput } from '@/components/EventDateInput';
import { localTimeZone, parseLocalDateTime } from '@/lib/time';
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { createEvent, EVENT_CATEGORIES } from '@/lib/events';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { colors, spacing, typography } from '@/theme';
import type { EventCategory } from '@/lib/types';

export default function EventFormScreen() {
  const { session, profile } = useAuth();
  return (
    <NewEventForm key={JSON.stringify([session?.user.id, profile?.chapter_id, profile?.status])} />
  );
}

function NewEventForm() {
  const router = useRouter();
  const { session, profile } = useAuth();

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

  async function submit() {
    if (busy.current || !live.current) return;
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
    const startsAt = parseLocalDateTime(date, time, null, occurrence);
    if (!startsAt) {
      setError(
        'Choose a valid local date and time. Times skipped by daylight saving are invalid; repeated times need an occurrence.',
      );
      return;
    }
    if (!profile?.chapter_id || !session?.user?.id) {
      setError('You need to be in a chapter to create an event.');
      return;
    }

    const endsAt =
      endDate || endTime ? parseLocalDateTime(endDate, endTime, null, endOccurrence) : null;
    if ((endDate || endTime) && (!endsAt || +endsAt <= +startsAt)) {
      setError('Choose a valid end time after the start, or clear both end fields.');
      return;
    }
    busy.current = true;
    setSubmitting(true);
    const { error: err } = await createEvent({
      chapterId: profile.chapter_id,
      createdBy: session.user.id,
      title: title.trim(),
      category,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt?.toISOString() ?? null,
      location: location.trim(),
      description: description.trim(),
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
      <ScreenHeader title="New event" onBack={() => router.back()} />
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

          <Button label="Create event" onPress={submit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mutedNote: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg },
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
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
