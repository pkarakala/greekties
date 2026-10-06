import { Text, View, StyleSheet } from 'react-native';
import type { SectionRead } from '@/lib/home';
import { Button } from './Button';
import { colors, spacing, typography } from '@/theme';

export function ReadStatus({ section, label }: { section: SectionRead<unknown>; label: string }) {
  return (
    <>
      {section.loading && (
        <Text accessibilityLiveRegion="polite" style={styles.meta}>
          {section.data === undefined ? `Loading ${label}…` : `Updating ${label}…`}
        </Text>
      )}
      {section.error && (
        <View style={styles.section}>
          <Text accessibilityRole="alert" style={styles.error}>
            Couldn’t load {label}.
            {section.data !== undefined ? ' Showing the last loaded information.' : ''}
          </Text>
          <Button label={`Retry ${label}`} variant="secondary" onPress={section.reload} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  meta: { ...typography.bodySmall, color: colors.textSecondary },
  section: { gap: spacing.sm },
  error: { ...typography.bodySmall, color: colors.red },
});
