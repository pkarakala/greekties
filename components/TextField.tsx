import { homeColors } from '@/theme/home';
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  errorText?: string;
  tone?: 'home';
}

export function TextField({ label, errorText, style, tone, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, tone === 'home' && styles.homeLabel]}>{label}</Text>
      <TextInput
        placeholderTextColor={tone === 'home' ? homeColors.muted : colors.textTertiary}
        accessibilityLabel={
          tone === 'home' ? (rest.accessibilityLabel ?? label) : rest.accessibilityLabel
        }
        selectionColor={tone === 'home' ? homeColors.blue : colors.gold}
        style={[
          styles.input,
          focused && styles.inputFocused,
          tone === 'home' && styles.homeInput,
          tone === 'home' && focused && { borderColor: homeColors.blue },
          !!errorText && styles.inputError,
          style,
        ]}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        {...rest}
      />
      {!!errorText && <Text style={styles.error}>{errorText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  homeLabel: {
    color: homeColors.navy,
    textTransform: 'none',
    letterSpacing: 0,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
  },
  homeInput: {
    color: homeColors.navy,
    backgroundColor: homeColors.surface,
    borderRadius: 6,
    borderColor: '#7F8CA1',
    minHeight: 48,
    fontSize: 15,
    lineHeight: 23,
  },
  inputFocused: { borderColor: colors.gold },
  inputError: { borderColor: colors.red },
  error: {
    ...typography.caption,
    color: colors.red,
    marginTop: spacing.xs,
  },
});
