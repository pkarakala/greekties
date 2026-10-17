import { View, Text, StyleSheet, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Badge } from './Badge';
import { timeAgoShort } from '@/lib/time';
import { colors as legacyColors, spacing, typography } from '@/theme';
import { colors as networkColors, typography as networkTypography } from '@/theme/network';
import type { JobPosting } from '@/lib/types';

interface JobCardProps {
  job: JobPosting;
  tone?: 'default' | 'home';
  onPress?: PressableProps['onPress'];
}

export function JobCard({ job, onPress, tone = 'default' }: JobCardProps) {
  const styles = tone === 'home' ? networkStyles : legacyStyles;
  const colors = tone === 'home' ? networkColors : legacyColors;
  return (
    <Card tone={tone} style={styles.card} onPress={onPress}>
      <View style={styles.top}>
        <View style={styles.flex}>
          {job.is_open === false && <Badge appearance={tone} label="Closed" tone="gold" />}
          <Text style={styles.title}>{job.title}</Text>
          <Text style={styles.company}>{job.company}</Text>
        </View>
      </View>

      <View style={styles.meta}>
        {!!job.location && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>{job.location}</Text>
          </View>
        )}
        {!!job.industry && <Badge appearance={tone} label={job.industry} tone="gold" />}
      </View>
      <View style={styles.bottom}>
        <Text style={styles.time}>Posted {timeAgoShort(job.created_at)}</Text>
        {onPress && (
          <View style={styles.action}>
            <Text style={styles.actionLabel}>View job</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

const legacyStyles = StyleSheet.create({
  card: { gap: spacing.sm, borderRadius: 8, padding: spacing.md },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { ...typography.h3, lineHeight: 24, color: legacyColors.textPrimary },
  company: {
    fontSize: 15,
    lineHeight: 21,
    color: legacyColors.textSecondary,
    marginTop: spacing.xs,
  },
  time: { ...typography.caption, color: legacyColors.textTertiary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { fontSize: 13, lineHeight: 18, color: legacyColors.textSecondary, flexShrink: 1 },
  bottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionLabel: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: legacyColors.gold },
});

const networkStyles = StyleSheet.create({
  ...legacyStyles,
  title: { ...networkTypography.h3, color: networkColors.blue },
  company: { ...legacyStyles.company, color: networkColors.navy, lineHeight: 23 },
  time: { ...legacyStyles.time, color: networkColors.muted },
  metaText: { ...legacyStyles.metaText, color: networkColors.muted },
  actionLabel: { ...legacyStyles.actionLabel, color: networkColors.blue },
});
