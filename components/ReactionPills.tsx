import { Pressable, Text, View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, typography } from '@/theme';
import type { ReactionSummary } from '@/lib/reactions';

interface ReactionPillsProps {
  reactions: ReactionSummary[];
  /** Toggle the viewer's reaction with this emoji (tap on a pill). */
  onToggle: (emoji: string) => void;
  /** Open the emoji picker sheet (tap on the '+' pill). */
  onAdd: () => void;
}

/**
 * Row of emoji-reaction pills under a chat bubble (emoji + count; gold tint
 * when the viewer reacted) plus a subtle '+' pill to add a new reaction.
 * Styling follows Chip.tsx: surface/border resting, goldSoft/gold selected.
 */
export function ReactionPills({ reactions, onToggle, onAdd }: ReactionPillsProps) {
  if (reactions.length === 0) return null;

  return (
    <View style={styles.row}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onToggle(r.emoji);
          }}
          style={[styles.pill, r.mine && styles.pillMine]}
        >
          <Text style={styles.emoji}>{r.emoji}</Text>
          <Text style={[styles.count, r.mine && styles.countMine]}>{r.count}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onAdd();
        }}
        style={styles.pill}
        hitSlop={4}
      >
        <Text style={styles.addText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillMine: { backgroundColor: colors.goldSoft, borderColor: colors.gold },
  emoji: { fontSize: 13 },
  count: { ...typography.caption, color: colors.textSecondary },
  countMine: { color: colors.gold, fontWeight: '600' },
  addText: { ...typography.caption, color: colors.textTertiary, fontWeight: '600' },
});
