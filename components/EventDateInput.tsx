import { useEffect, useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button } from './Button';
import {
  localDateTimeCandidates,
  localTimeZone,
  toLocalDateTimeFields,
  eventDateTime,
} from '@/lib/time';
import { colors, spacing, typography } from '@/theme';

export interface EventDateInputProps {
  timeZone?: string;
  optional?: boolean;
  label: string;
  date: string;
  time: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  occurrence?: string;
  onOccurrence: (value: string | undefined) => void;
  original?: string | null;
}
export function EventDateInput(props: EventDateInputProps) {
  const {
    label,
    date,
    time,
    onDate,
    onTime,
    occurrence,
    onOccurrence,
    original,
    timeZone,
    optional,
  } = props;
  const [picker, setPicker] = useState<{ mode: 'date' | 'time'; revision: number } | null>(null);
  const revision = useRef(0);
  const [seed] = useState(() => new Date());
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  const mode = picker?.mode;
  const open = (next: 'date' | 'time') => setPicker({ mode: next, revision: ++revision.current });
  const close = () => {
    revision.current++;
    setPicker(null);
  };
  const candidates = localDateTimeCandidates(date, time);
  const originalFields = original ? toLocalDateTimeFields(original) : null;
  const unchanged = originalFields?.date === date && originalFields.time === time;
  // Missing components are picker-only defaults. They never populate the form.
  const day = localDateTimeCandidates(date, '12:00')[0] ?? seed;
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const [hours, minutes] = validTime
    ? time.split(':').map(Number)
    : [seed.getHours(), seed.getMinutes()];
  let partial = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
  if (mode === 'time' && (partial.getHours() !== hours || partial.getMinutes() !== minutes)) {
    // A DST-gap wall time cannot be represented on its chosen date. The time
    // control uses a neutral day; the unchanged form still rejects that gap.
    partial = new Date(2000, 0, 15, hours, minutes);
  }
  const value =
    candidates.find((d) => d.toISOString() === occurrence) ??
    (unchanged && !occurrence && original ? new Date(original) : candidates[0]) ??
    partial;
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
      <Text style={{ ...typography.h3, color: colors.textPrimary }}>{label}</Text>
      <Text style={{ ...typography.bodySmall, color: colors.textSecondary }}>
        Local time · {timeZone ?? localTimeZone()}
      </Text>
      <Button
        label={`${label} date: ${date || 'Choose date'}`}
        variant="secondary"
        onPress={() => open('date')}
      />
      <Button
        label={`${label} time: ${time || 'Choose time'}`}
        variant="secondary"
        onPress={() => open('time')}
      />
      {mode && (
        <DateTimePicker
          value={value}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selected) => {
            if (!picker || revision.current !== picker.revision) return;
            if (Platform.OS !== 'ios' || event.type !== 'set') close();
            if (event.type !== 'set' || !selected) return;
            const fields = toLocalDateTimeFields(selected.toISOString());
            if (mode === 'date') onDate(fields.date);
            else onTime(fields.time);
            onOccurrence(undefined);
          }}
        />
      )}
      {mode && Platform.OS === 'ios' && <Button label="Done" variant="ghost" onPress={close} />}
      {optional && !!(date || time || occurrence) && (
        <Button
          label="Clear end time"
          variant="ghost"
          onPress={() => {
            close();
            onDate('');
            onTime('');
            onOccurrence(undefined);
          }}
        />
      )}
      {candidates.length > 1 && (
        <>
          <Text style={{ color: colors.textSecondary }}>
            This time occurs twice when clocks change. Choose an occurrence.
            {unchanged && !occurrence ? ' The saved occurrence is retained.' : ''}
          </Text>
          {candidates.map((d, index) => (
            <Button
              key={d.toISOString()}
              label={`${index === 0 ? 'First' : 'Second'} · ${eventDateTime(d.toISOString())}`}
              variant={occurrence === d.toISOString() ? 'primary' : 'secondary'}
              onPress={() => onOccurrence(d.toISOString())}
            />
          ))}
        </>
      )}
    </View>
  );
}
