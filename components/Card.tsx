import {
  Pressable,
  View,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
  type PressableProps,
} from 'react-native';
import { colors, radius, spacing } from '@/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Use the elevated surface (modals, highlighted cards). */
  elevated?: boolean;
  /** Makes the card pressable with a dim + scale press state. */
  onPress?: PressableProps['onPress'];
}

export function Card({ children, style, elevated, onPress }: CardProps) {
  const base = [styles.card, elevated && styles.elevated, style];

  if (!onPress) {
    return <View style={base}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  elevated: { backgroundColor: colors.surfaceElevated },
  pressed: { backgroundColor: colors.surfaceHover, transform: [{ scale: 0.98 }] },
});
