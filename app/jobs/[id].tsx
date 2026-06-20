import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Linking, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useJob } from '@/lib/jobs';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { timeAgoShort } from '@/lib/time';
import { colors, radius, spacing, typography } from '@/theme';
import type { Profile } from '@/lib/types';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { loading, job } = useJob(id ?? null);
  const [poster, setPoster] = useState<Profile | null>(null);

  useEffect(() => {
    if (!job?.posted_by) return;
    let mounted = true;
    supabase
      .from('profiles')
      .select('*')
      .eq('user_id', job.posted_by)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted) setPoster((data as Profile) ?? null);
      });
    return () => {
      mounted = false;
    };
  }, [job?.posted_by]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !job ? (
        <View style={styles.center}>
          <Text style={styles.muted}>This posting couldn’t be found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{job.title}</Text>
          <Text style={styles.company}>{job.company}</Text>

          <View style={styles.meta}>
            {!!job.location && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={15} color={colors.textTertiary} />
                <Text style={styles.metaText}>{job.location}</Text>
              </View>
            )}
            <Text style={styles.metaText}>· {timeAgoShort(job.created_at)} ago</Text>
            {!!job.industry && <Badge label={job.industry} tone="gold" />}
          </View>

          {!!job.apply_url && (
            <Button
              label="Apply"
              onPress={() => Linking.openURL(job.apply_url as string).catch(() => {})}
            />
          )}

          {!!job.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About the role</Text>
              <Text style={styles.body}>{job.description}</Text>
            </View>
          )}

          {!!poster && (
            <Pressable
              style={styles.poster}
              onPress={() => router.push({ pathname: '/profile/[id]', params: { id: poster.id } })}
            >
              <Avatar uri={poster.avatar_url} name={poster.name} size="sm" />
              <View style={styles.flex}>
                <Text style={styles.posterLabel}>Posted by</Text>
                <Text style={styles.posterName}>{poster.name ?? 'Member'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.body, color: colors.textSecondary },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary },
  company: { ...typography.h3, color: colors.textSecondary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.bodySmall, color: colors.textTertiary },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  poster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  posterLabel: { ...typography.caption, color: colors.textTertiary },
  posterName: { ...typography.h3, color: colors.textPrimary },
});
