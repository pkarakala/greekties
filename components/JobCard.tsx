import { View, Text, StyleSheet, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Badge } from './Badge';
import { timeAgoShort } from '@/lib/time';
import { colors, spacing, typography } from '@/theme';
import type { JobPosting } from '@/lib/types';

interface JobCardProps {
  job: JobPosting;
  onPress?: PressableProps['onPress'];
}

export function JobCard({ job, onPress }: JobCardProps) {
  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {job.title}
          </Text>
          <Text style={styles.company} numberOfLines={1}>
            {job.company}
          </Text>
        </View>
        <Text style={styles.time}>{timeAgoShort(job.created_at)}</Text>
      </View>

      <View style={styles.meta}>
        {!!job.location && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>{job.location}</Text>
          </View>
        )}
        {!!job.industry && <Badge label={job.industry} tone="gold" />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { ...typography.h3, color: colors.textPrimary },
  company: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  time: { ...typography.caption, color: colors.textTertiary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.caption, color: colors.textTertiary },
});
