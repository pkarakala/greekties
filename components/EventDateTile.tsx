import { View, Text, StyleSheet } from 'react-native';
import { homeColors } from '@/theme/home';
import { eventColors } from '@/theme/events';
import { spacing } from '@/theme';

/** Decorative identity derived from the same local date as the agenda. */
export function EventDateTile({
  startsAt,
  prominent = false,
  compact = false,
  tone,
}: {
  startsAt: string;
  prominent?: boolean;
  compact?: boolean;
  tone?: 'home';
}) {
  const date = new Date(startsAt);
  if (!Number.isFinite(+date)) return null;
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        prominent && styles.prominent,
        tone === 'home' && { backgroundColor: homeColors.gold },
      ]}
    >
      {/* The full date below the title remains accessible and scales without a cap. */}
      <Text
        maxFontSizeMultiplier={compact ? 1.2 : undefined}
        style={[
          styles.month,
          prominent && styles.onAction,
          tone === 'home' && { color: homeColors.navy },
        ]}
      >
        {date.toLocaleDateString([], { month: prominent && !compact ? 'long' : 'short' })}
      </Text>
      <Text
        maxFontSizeMultiplier={compact ? 1.2 : undefined}
        style={[
          styles.day,
          prominent && !compact && styles.largeDay,
          prominent && styles.onAction,
          tone === 'home' && { color: homeColors.navy },
        ]}
      >
        {date.getDate()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    minWidth: 76,
    minHeight: 76,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: eventColors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prominent: { backgroundColor: eventColors.action, padding: 0 },
  month: { fontSize: 13, lineHeight: 18, textTransform: 'uppercase', color: eventColors.accent },
  day: { fontSize: 30, lineHeight: 36, fontWeight: '600', color: eventColors.accent },
  largeDay: { fontSize: 44, lineHeight: 48 },
  onAction: { color: eventColors.onAction },
});
