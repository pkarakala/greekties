import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Button } from './Button';
import { colors, typography } from '@/theme/account';

/** Presentation of an existing read/reload contract, never a replacement service. */
export function AccountReadStatus({
  loading,
  error,
  reload,
  label,
}: {
  loading: boolean;
  error: string | null;
  reload: () => void;
  label: string;
}) {
  if (!loading && !error) return null;
  return (
    <View style={styles.notice}>
      {loading && (
        <>
          <ActivityIndicator color={colors.blue} />
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            Loading {label}…
          </Text>
        </>
      )}
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={styles.error}>
            Couldn’t load {label}. Please retry.
          </Text>
          <Button
            tone="home"
            label={`Retry ${label}`}
            variant="secondary"
            onPress={reload}
            loading={loading}
          />
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  notice: {
    padding: 16,
    backgroundColor: colors.goldLight,
    borderTopWidth: 6,
    borderTopColor: colors.gold,
    gap: 8,
  },
  text: { ...typography.body, color: colors.navy },
  error: { ...typography.body, color: colors.error },
});
