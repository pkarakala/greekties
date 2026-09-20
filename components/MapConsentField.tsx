import { View, Text, Switch, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/theme';

export function MapConsentField({
  enabled,
  onChange,
  disabled,
  available,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled: boolean;
  available: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        City is optional and visible in your chapter profile, even with map sharing off.
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>Share my city on the alumni map</Text>
        <Switch
          accessibilityLabel="Share my city on the alumni map"
          value={enabled}
          onValueChange={onChange}
          disabled={disabled || !available}
          trackColor={{ false: colors.surfaceElevated, true: colors.navy }}
        />
      </View>
      <Text style={styles.hint}>
        If a chapter admin has designated you as alumni, approved members of your chapter can see
        your approximate city location. No device GPS or live tracking is used. Turn this off and
        tap Save to remove your pin while keeping your profile city. Changes take effect when you
        save.
      </Text>
      {!available && (
        <Text style={styles.hint}>
          Map privacy controls are unavailable. Sharing stays off in this app. City and map settings
          cannot be saved until the service is updated; other profile edits can still be saved.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...typography.h3, color: colors.textPrimary, flex: 1 },
  hint: { ...typography.bodySmall, color: colors.textSecondary },
});
