import { View, Text } from 'react-native';
import { Button } from './Button';
import type { EventDateInputProps } from './EventDateInput';
import { localDateTimeCandidates, localTimeZone, eventDateTime } from '@/lib/time';
import { homeColors } from '@/theme/home';
import { colors, spacing, typography } from '@/theme';

export function EventDateInput({
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
  tone,
}: EventDateInputProps) {
  const palette =
    tone === 'home'
      ? {
          ...colors,
          textPrimary: homeColors.navy,
          textSecondary: homeColors.muted,
          borderStrong: '#7F8CA1',
          surface: homeColors.surface,
        }
      : colors;
  const candidates = localDateTimeCandidates(date, time);
  const inputStyle = {
    minHeight: 48,
    padding: 12,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: tone === 'home' ? 6 : 12,
    font: 'inherit',
    color: palette.textPrimary,
    background: palette.surface,
    maxWidth: '100%',
    boxSizing: 'border-box' as const,
  };
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
      <Text style={{ ...typography.h3, color: palette.textPrimary }}>{label}</Text>
      <Text style={{ ...typography.bodySmall, color: palette.textSecondary }}>
        Local time · {timeZone ?? localTimeZone()}
      </Text>
      <label>
        {label} date{' '}
        <input
          aria-label={`${label} date`}
          type="date"
          value={date}
          style={inputStyle}
          onChange={(e) => {
            onDate(e.target.value);
            onOccurrence(undefined);
          }}
        />
      </label>
      <label>
        {label} time{' '}
        <input
          aria-label={`${label} time`}
          type="time"
          value={time}
          style={inputStyle}
          onChange={(e) => {
            onTime(e.target.value);
            onOccurrence(undefined);
          }}
        />
      </label>
      {optional && !!(date || time || occurrence) && (
        <Button
          tone={tone}
          label="Clear end time"
          variant="ghost"
          onPress={() => {
            onDate('');
            onTime('');
            onOccurrence(undefined);
          }}
        />
      )}
      {candidates.length > 1 && (
        <>
          <Text style={{ color: palette.textSecondary }}>
            This time occurs twice when clocks change. Choose an occurrence.
            {original && !occurrence
              ? ' An unchanged saved time keeps its original occurrence.'
              : ''}
          </Text>
          {candidates.map((d, index) => (
            <Button
              tone={tone}
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
