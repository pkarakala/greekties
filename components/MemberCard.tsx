import { View, Text, StyleSheet, type PressableProps } from 'react-native';
import { Card } from './Card';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { colors, spacing, typography } from '@/theme';
import type { Profile } from '@/lib/types';

interface MemberCardProps {
  profile: Profile;
  variant?: 'row' | 'compact';
  onPress?: PressableProps['onPress'];
}

function subtitle(p: Profile): string {
  // "Software Engineer at Google" / "Google" / "Member"
  if (p.job_title && p.company) return `${p.job_title} at ${p.company}`;
  return p.job_title || p.company || p.role || 'Member';
}

function MemberBadges({ p }: { p: Profile }) {
  return (
    <View style={styles.badges}>
      {p.open_to_mentor && <Badge label="Mentor" tone="gold" />}
      {p.is_hiring && <Badge label="Hiring" tone="green" />}
      {p.role === 'Alumni' && <Badge label="Alumni" />}
    </View>
  );
}

export function MemberCard({ profile, variant = 'row', onPress }: MemberCardProps) {
  if (variant === 'compact') {
    return (
      <Card style={styles.compact} onPress={onPress}>
        <Avatar uri={profile.avatar_url} name={profile.name} size="md" />
        <Text style={styles.compactName} numberOfLines={1}>
          {profile.name ?? 'Member'}
        </Text>
        <Text style={styles.compactSub} numberOfLines={1}>
          {subtitle(profile)}
        </Text>
        {!!profile.class_year && (
          <Text style={styles.year}>’{String(profile.class_year).slice(-2)}</Text>
        )}
        <MemberBadges p={profile} />
      </Card>
    );
  }

  return (
    <Card style={styles.row} onPress={onPress}>
      <Avatar uri={profile.avatar_url} name={profile.name} size="sm" />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {profile.name ?? 'Member'}
          </Text>
          {!!profile.class_year && (
            <Text style={styles.year}>’{String(profile.class_year).slice(-2)}</Text>
          )}
        </View>
        <Text style={styles.rowSub} numberOfLines={1}>
          {subtitle(profile)}
        </Text>
        <MemberBadges p={profile} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // compact (horizontal rail)
  compact: { width: 160, gap: spacing.xs },
  compactName: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.sm },
  compactSub: { ...typography.bodySmall, color: colors.textSecondary },

  // row (lists)
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: { ...typography.h3, color: colors.textPrimary, flexShrink: 1 },
  rowSub: { ...typography.bodySmall, color: colors.textSecondary },

  year: { ...typography.caption, color: colors.textTertiary },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});
