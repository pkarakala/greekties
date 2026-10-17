import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  type PressableProps,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, typography } from '@/theme';
import { homeColors } from '@/theme/home';
import { eventColors, eventTypography } from '@/theme/events';

type Variant = 'primary' | 'secondary' | 'ghost';
export type ButtonTone = 'default' | 'events' | 'home';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  tone?: ButtonTone;
  compact?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  tone = 'default',
  compact = false,
  disabled,
  onPress,
  accessibilityState,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled: !!isDisabled,
        busy: loading || !!accessibilityState?.busy,
      }}
      disabled={isDisabled}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        compact && { paddingHorizontal: 12 },
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        tone === 'events' && styles.events,
        tone === 'home' && styles.home,
        tone === 'home' && variant === 'primary' && { backgroundColor: homeColors.blue },
        tone === 'home' &&
          variant === 'secondary' && {
            backgroundColor: homeColors.surface,
            borderColor: homeColors.border,
          },
        tone === 'events' && variant === 'primary' && styles.eventsPrimary,
        tone === 'events' && variant === 'secondary' && styles.eventsSecondary,
        tone === 'events' && isDisabled && styles.eventsDisabled,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading && (
          <ActivityIndicator
            size="small"
            color={
              isDisabled
                ? tone === 'events'
                  ? eventColors.muted
                  : colors.textSecondary
                : variant === 'primary'
                  ? colors.cream
                  : colors.textPrimary
            }
            style={styles.spinner}
          />
        )}
        <Text
          style={[
            styles.label,
            variant === 'primary' ? styles.labelOnPrimary : styles.labelOnLight,
            isDisabled && styles.disabledLabel,
            tone === 'events' && styles.eventsLabel,
            tone === 'home' && {
              color: variant === 'primary' ? homeColors.surface : homeColors.blue,
              fontSize: 15,
              lineHeight: 23,
              letterSpacing: 0,
            },
            tone === 'events' && isDisabled && { color: eventColors.muted },
            tone === 'events' && variant === 'primary' && !isDisabled && styles.eventsOnPrimary,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  fullWidth: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.navy },
  secondary: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  ghost: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.85 },
  disabled: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceHover,
  },
  disabledLabel: { color: colors.textSecondary },
  content: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  spinner: { marginRight: spacing.sm },
  label: { ...typography.h3, flexShrink: 1, textAlign: 'center' },
  labelOnPrimary: { color: colors.cream },
  labelOnLight: { color: colors.textPrimary },
  home: { borderRadius: 6 },
  events: { borderRadius: 8, paddingHorizontal: spacing.md },
  eventsPrimary: { backgroundColor: eventColors.action },
  eventsSecondary: { backgroundColor: eventColors.surface, borderColor: eventColors.control },
  eventsDisabled: { backgroundColor: eventColors.soft, borderColor: eventColors.control },
  eventsLabel: { ...eventTypography.support, fontWeight: '600', color: eventColors.text },
  eventsOnPrimary: { color: eventColors.onAction },
});
