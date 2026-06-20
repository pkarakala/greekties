import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

type Tone = 'gold' | 'green' | 'neutral';

interface BadgeProps {
  label: string;
  tone?: Tone;
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <View style={[styles.badge, styles[`${tone}Bg`]]}>
      <Text style={[styles.text, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: { ...typography.caption },
  goldBg: { backgroundColor: colors.goldSoft },
  goldText: { color: colors.gold },
  greenBg: { backgroundColor: 'rgba(74,222,128,0.12)' },
  greenText: { color: colors.green },
  neutralBg: { backgroundColor: colors.surfaceHover },
  neutralText: { color: colors.textSecondary },
});
