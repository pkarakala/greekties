import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';

interface StatPillProps {
  label: string;
  /** Show an up-arrow + green tint for positive/growth stats. */
  positive?: boolean;
}

export function StatPill({ label, positive }: StatPillProps) {
  return (
    <View style={[styles.pill, positive && styles.positivePill]}>
      {positive && (
        <Ionicons
          name="arrow-up"
          size={12}
          color={colors.green}
          style={styles.icon}
        />
      )}
      <Text style={[styles.text, positive && styles.positiveText]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHover,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  positivePill: { backgroundColor: 'rgba(74,222,128,0.12)' },
  icon: { marginRight: 4 },
  text: { ...typography.caption, color: colors.textSecondary },
  positiveText: { color: colors.green },
});
