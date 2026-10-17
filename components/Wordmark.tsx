import { View, Text, StyleSheet } from 'react-native';
import { homeColors, homeTypography } from '@/theme/home';
import { colors, typography } from '@/theme';

/** The Greek Ties wordmark. Gold "Greek", warm-white "Ties". */
export function Wordmark({ size = 32, tone }: { size?: number; tone?: 'home' }) {
  if (tone === 'home')
    return (
      <View style={styles.homeBand}>
        <Text
          accessibilityRole="header"
          style={{
            ...homeTypography.page,
            fontSize: size,
            lineHeight: Math.round(size * 1.2),
            color: homeColors.blue,
            textAlign: 'center',
          }}
        >
          Greek Ties
        </Text>
      </View>
    );
  return (
    <View style={styles.row}>
      <Text style={[styles.word, { fontSize: size }, styles.gold]}>Greek</Text>
      <Text style={[styles.word, { fontSize: size }, styles.light]}> Ties</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  homeBand: {
    width: '100%',
    padding: 16,
    backgroundColor: homeColors.goldLight,
    borderTopWidth: 6,
    borderTopColor: homeColors.gold,
    borderRadius: 8,
  },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  word: { fontWeight: typography.h1.fontWeight, letterSpacing: -0.5 },
  gold: { color: colors.gold },
  light: { color: colors.textPrimary },
});
