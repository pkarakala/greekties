import {
  Pressable,
  View,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
  type PressableProps,
} from 'react-native';
import { homeColors } from '@/theme/home';
import { colors, radius, spacing } from '@/theme';

interface CardProps {
  children: React.ReactNode;
  tone?: 'default' | 'home';
  style?: StyleProp<ViewStyle>;
  /** Use the elevated surface (modals, highlighted cards). */
  elevated?: boolean;
  /** Makes the card pressable with a quiet surface press state. */
  onPress?: PressableProps['onPress'];
}

export function Card({ children, style, elevated, onPress, tone = 'default' }: CardProps) {
  const base = [styles.card, elevated && styles.elevated, tone === 'home' && styles.home, style];

  if (!onPress) {
    return <View style={base}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && (tone === 'home' ? styles.homePressed : styles.pressed),
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  home: { backgroundColor: homeColors.surface, borderColor: homeColors.border, borderRadius: 8 },
  homePressed: { backgroundColor: homeColors.goldLight },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 44,
  },
  elevated: { backgroundColor: colors.surfaceElevated },
  pressed: { backgroundColor: colors.surfaceHover },
});
