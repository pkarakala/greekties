import { View, Text, StyleSheet, useWindowDimensions, type PressableProps } from 'react-native';
import { Card } from './Card';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { colors, spacing, typography } from '@/theme';
import { colors as networkColors } from '@/theme/network';
import type { Profile } from '@/lib/types';

interface MemberCardProps {
  profile: Profile;
  variant?: 'row' | 'compact';
  tone?: 'default' | 'home';
  onPress?: PressableProps['onPress'];
}

function subtitle(p: Profile): string {
  // "Software Engineer at Google" / "Google" / "Member"
  if (p.job_title && p.company) return `${p.job_title} at ${p.company}`;
  return p.job_title || p.company || p.role || 'Member';
}

function MemberBadges({ p, tone }: { p: Profile; tone: 'default' | 'home' }) {
  const styles = legacyStyles;
  return (
    <View style={styles.badges}>
      {p.open_to_mentor && <Badge appearance={tone} label="Mentor" tone="gold" />}
      {p.is_hiring && <Badge appearance={tone} label="Hiring" tone="green" />}
      {p.membership_type === 'alumni' && <Badge appearance={tone} label="Alumni" />}
    </View>
  );
}

export function MemberCard({
  profile,
  variant = 'row',
  onPress,
  tone = 'default',
}: MemberCardProps) {
  const styles = tone === 'home' ? networkStyles : legacyStyles;
  const { width, fontScale } = useWindowDimensions();
  if (variant === 'compact') {
    return (
      <Card tone={tone} style={styles.compact} onPress={onPress}>
        <Avatar tone={tone} uri={profile.avatar_url} name={profile.name} size="md" />
        <Text style={styles.compactName} numberOfLines={1}>
          {profile.name ?? 'Member'}
        </Text>
        <Text style={styles.compactSub} numberOfLines={1}>
          {subtitle(profile)}
        </Text>
        {!!profile.class_year && (
          <Text style={styles.year}>’{String(profile.class_year).slice(-2)}</Text>
        )}
        <MemberBadges p={profile} tone={tone} />
      </Card>
    );
  }

  return (
    <Card
      tone={tone}
      style={[styles.row, (width < 350 || fontScale >= 1.4) && styles.stacked]}
      onPress={onPress}
    >
      <Avatar tone={tone} uri={profile.avatar_url} name={profile.name} size="sm" />
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{profile.name?.trim() || 'Member'}</Text>
        {(profile.job_title || profile.company || profile.role) && (
          <Text style={styles.rowSub}>{subtitle(profile)}</Text>
        )}
        {!!(profile.city || profile.industry) && (
          <Text style={styles.rowMeta}>
            {[profile.industry, profile.city].filter(Boolean).join(' · ')}
          </Text>
        )}
        <Text style={styles.rowMeta}>
          {[
            profile.membership_type === 'alumni' ? 'Alumni' : 'Current member',
            profile.class_year ? `Class of ${profile.class_year}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <View style={styles.badges}>
          {profile.open_to_mentor && <Text style={styles.signal}>Open to mentor</Text>}
          {profile.is_hiring && <Text style={styles.signal}>Hiring</Text>}
        </View>
        {onPress && (
          <View style={styles.action}>
            <Text style={styles.actionLabel}>View profile</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

const legacyStyles = StyleSheet.create({
  // compact (horizontal rail)
  compact: { width: 160, gap: spacing.xs },
  compactName: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.sm },
  compactSub: { ...typography.bodySmall, color: colors.textSecondary },

  // row (lists)
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: 8,
    padding: spacing.md,
  },
  stacked: { flexDirection: 'column' },
  rowBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  rowName: { ...typography.h3, lineHeight: 24, color: colors.textPrimary },
  rowSub: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  rowMeta: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  signal: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.gold,
    fontWeight: '600',
    backgroundColor: colors.goldSoft,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  action: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionLabel: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.gold },

  year: { ...typography.caption, color: colors.textTertiary },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});

const networkStyles = StyleSheet.create({
  ...legacyStyles,
  row: { ...legacyStyles.row, padding: 16, borderColor: networkColors.border },
  rowBody: { minWidth: 0, flexShrink: 1, gap: 4 },
  rowName: { fontSize: 17, lineHeight: 24, fontWeight: '600', color: networkColors.navy },
  rowSub: { fontSize: 15, lineHeight: 23, color: networkColors.muted },
  rowMeta: { fontSize: 12, lineHeight: 18, color: networkColors.muted },
  signal: {
    ...legacyStyles.signal,
    color: networkColors.navy,
    backgroundColor: networkColors.goldLight,
  },
  actionLabel: { ...legacyStyles.actionLabel, color: networkColors.blue },
  compactName: { ...legacyStyles.compactName, color: networkColors.navy },
  compactSub: { ...legacyStyles.compactSub, color: networkColors.muted },
  year: { ...legacyStyles.year, color: networkColors.muted },
});
