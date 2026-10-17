import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { homeColors } from '@/theme/home';
import { colors, spacing, typography } from '@/theme';

interface SegmentedControlProps<T extends string> {
  tone?: 'default' | 'home';
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  tone = 'default',
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.track, tone === 'home' && styles.homeTrack]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            {...(Platform.OS === 'web' ? { 'aria-pressed': active } : {})}
            style={[
              styles.segment,
              active && styles.activeSegment,
              tone === 'home' && styles.homeSegment,
              tone === 'home' && active && styles.homeSelected,
            ]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(opt.value);
            }}
          >
            <Text
              style={[
                styles.label,
                active && styles.activeLabel,
                tone === 'home' && { color: homeColors.navy },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  homeTrack: {
    borderColor: homeColors.border,
    backgroundColor: homeColors.surface,
    borderRadius: 6,
  },
  homeSegment: { minHeight: 48, borderRadius: 5 },
  homeSelected: { backgroundColor: homeColors.gold },
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeSegment: { backgroundColor: colors.navy },
  label: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  activeLabel: { color: colors.cream },
});
