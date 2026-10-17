import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

import { homeColors } from '@/theme/home';

type Tone = 'gold' | 'green' | 'neutral';

interface BadgeProps {
  label: string;
  appearance?: 'default' | 'home';
  tone?: Tone;
}

export function Badge({ label, tone = 'neutral', appearance = 'default' }: BadgeProps) {
  return (
    <View style={[styles.badge, styles[`${tone}Bg`], appearance === 'home' && styles.homeBg]}>
      <Text style={[styles.text, styles[`${tone}Text`], appearance === 'home' && styles.homeText]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  homeBg: { backgroundColor: homeColors.goldLight, borderRadius: 5 },
  homeText: { color: homeColors.navy, fontSize: 12, lineHeight: 18 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: { ...typography.caption },
  goldBg: { backgroundColor: colors.goldSoft },
  goldText: { color: colors.gold },
  greenBg: { backgroundColor: 'rgba(31,138,76,0.12)' },
  greenText: { color: colors.green },
  neutralBg: { backgroundColor: colors.surfaceHover },
  neutralText: { color: colors.textSecondary },
});
