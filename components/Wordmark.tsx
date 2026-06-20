import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '@/theme';

/** The Greek Ties wordmark. Gold "Greek", warm-white "Ties". */
export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.word, { fontSize: size }, styles.gold]}>Greek</Text>
      <Text style={[styles.word, { fontSize: size }, styles.light]}> Ties</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline' },
  word: { fontWeight: typography.h1.fontWeight, letterSpacing: -0.5 },
  gold: { color: colors.gold },
  light: { color: colors.textPrimary },
});
