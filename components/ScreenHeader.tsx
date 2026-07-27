import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  /** Optional right-side action (icon button). */
  right?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; badge?: number };
}

export function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </Pressable>
        )}
      </View>

      <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.side, styles.right]}>
        {right && (
          <Pressable accessibilityRole="button" onPress={right.onPress} hitSlop={12}>
            <Ionicons name={right.icon} size={24} color={colors.textPrimary} />
            {!!right.badge && right.badge > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{right.badge > 9 ? '9+' : right.badge}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  side: { width: 40, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { ...typography.h2, color: colors.textPrimary, flex: 1, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.caption, fontSize: 10, color: colors.background },
});
