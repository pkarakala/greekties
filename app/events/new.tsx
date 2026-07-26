import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
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

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Parse "YYYY-MM-DD" + "HH:MM" as LOCAL time. Number-args Date construction is
 * deliberate — string parsing ("2026-08-03T19:00") is treated as UTC or local
 * depending on the JS engine, which silently shifts event times.
 */
function parseLocalDateTime(date: string, time: string): Date | null {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) return null;

  const [, y, mo, d] = dm;
  const [, hh, mm] = tm;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hours = Number(hh);
  const minutes = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hours > 23 || minutes > 59) return null;

  const parsed = new Date(year, month - 1, day, hours, minutes);
  // Reject rollover dates like 2026-02-31 (which Date silently turns into Mar 3).
  if (parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

export default function NewEventScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('chapter');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!title.trim()) {
      setError('Give the event a title.');
      return;
    }
    const startsAt = parseLocalDateTime(date.trim(), time.trim());
    if (!startsAt) {
      setError('Enter the date as YYYY-MM-DD and the time as HH:MM (24-hour).');
      return;
    }
    if (!profile?.chapter_id || !session?.user?.id) {
      setError('You need to be in a chapter to create an event.');
      return;
    }

    setSubmitting(true);
    const { error: err } = await createEvent({
      chapterId: profile.chapter_id,
      createdBy: session.user.id,
      title: title.trim(),
      category,
      startsAt: startsAt.toISOString(),
      location: location.trim(),
      description: description.trim(),
    });
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

          <TextField
            label="Date"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            label="Time"
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
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
