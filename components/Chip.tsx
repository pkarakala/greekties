import { Pressable, Text, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, typography } from '@/theme';
import { homeColors } from '@/theme/home';
import { eventColors, eventTypography } from '@/theme/events';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  tone?: 'default' | 'events' | 'home';
}

/** Selectable filter chip. Gold tint when active. */
export function Chip({ label, selected, onPress, tone = 'default' }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      {...(Platform.OS === 'web' ? { 'aria-pressed': !!selected } : {})}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[
        styles.chip,
        selected && styles.selected,
        tone === 'events' && styles.events,
        tone === 'events' && selected && styles.eventsSelected,
        tone === 'home' && styles.home,
        tone === 'home' &&
          selected && { backgroundColor: homeColors.gold, borderColor: homeColors.blue },
      ]}
    >
      <Text
        style={[
          styles.text,
          selected && styles.selectedText,
          tone === 'events' && styles.eventsText,
          tone === 'events' && selected && styles.eventsSelectedText,
          tone === 'home' && { color: homeColors.navy, fontSize: 15, lineHeight: 23 },
          tone === 'home' && selected && { fontWeight: '600' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.goldSoft, borderColor: colors.gold },
  text: { ...typography.bodySmall, color: colors.textSecondary },
  selectedText: { color: colors.gold, fontWeight: '600' },
  home: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 5,
    backgroundColor: homeColors.surface,
    borderColor: homeColors.border,
  },
  events: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 8,
    borderColor: eventColors.control,
    backgroundColor: eventColors.surface,
  },
  eventsSelected: { backgroundColor: eventColors.action, borderColor: eventColors.action },
  eventsText: { ...eventTypography.support, color: eventColors.text },
  eventsSelectedText: { color: eventColors.onAction, fontWeight: '600' },
});
