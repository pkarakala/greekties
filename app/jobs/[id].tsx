import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useJob } from '@/lib/jobs';
import { reportContent } from '@/lib/moderation';
import { openExternalUrl } from '@/lib/url';
import { isAdmin } from '@/lib/types';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { TextField } from '@/components/TextField';
import { timeAgoShort } from '@/lib/time';
import { colors, radius, spacing, typography } from '@/theme';
import type { JobPosting, Profile } from '@/lib/types';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile: me } = useAuth();
  const myUserId = session?.user?.id ?? null;
  const { loading, job: fetchedJob } = useJob(id ?? null);
  const [poster, setPoster] = useState<Profile | null>(null);

  // useJob has no reload, so keep a local copy and refetch it on focus —
  // returning from the edit screen should show the saved changes.
  const [job, setJob] = useState<JobPosting | null>(null);
  useEffect(() => {
    setJob(fetchedJob);
  }, [fetchedJob]);
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let mounted = true;
      supabase
        .from('job_postings')
        .select('*')
        .eq('id', id)
        .maybeSingle()
        .then(({ data }) => {
          if (mounted && data) setJob(data as JobPosting);
        });
      return () => {
        mounted = false;
      };
    }, [id]),
  );

  // Report composer (Android — iOS uses Alert.prompt).
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [closing, setClosing] = useState(false);

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

  const isOwner = !!job && !!myUserId && (job.posted_by === myUserId || isAdmin(me));

  // ── Moderation (report posting) ────────────────────────────────────────────

  async function submitReport(reason: string) {
    if (!job || !myUserId) return;
    if (!reason.trim()) return;
    setReportSubmitting(true);
    const { error: reportError } = await reportContent({
      reporterId: myUserId,
      chapterId: me?.chapter_id ?? null,
      targetType: 'job',
      targetId: job.id,
      reason: reason.trim(),
    });
    setReportSubmitting(false);
    setReporting(false);
    setReportReason('');
    if (reportError) Alert.alert('Couldn’t submit report', reportError);
    else Alert.alert('Report submitted', 'Thanks — our team will review it.');
  }

  function startReport() {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Report posting',
        'Tell us what’s wrong with this job posting.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Report',
            style: 'destructive',
            onPress: (reason?: string) => void submitReport(reason ?? ''),
          },
        ],
        'plain-text',
      );
    } else {
      // Android has no Alert.prompt — show the inline reason composer.
      setReporting(true);
    }
  }

  // ── Owner controls (close / delete) ────────────────────────────────────────

  async function closePosting() {
    if (!job) return;
    setClosing(true);
    // `is_open` may not exist yet in the live DB — degrade gracefully.
    const { error } = await supabase
      .from('job_postings')
      .update({ is_open: false })
      .eq('id', job.id);
    setClosing(false);
    if (error) {
      Alert.alert('Not available yet', 'Closing postings isn’t supported yet. Check back soon.');
      return;
    }
    Alert.alert('Posting closed', 'This job is no longer marked as open.');
    router.back();
  }

  function confirmDelete() {
    if (!job) return;
    Alert.alert('Delete posting?', 'This permanently removes the job posting.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('job_postings').delete().eq('id', job.id);
          if (error) Alert.alert('Couldn’t delete', 'Please try again.');
          else router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title=""
        onBack={() => router.back()}
        right={
          job && myUserId && !isOwner
            ? { icon: 'ellipsis-horizontal', onPress: startReport }
            : undefined
        }
      />

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
            <Button label="Apply" onPress={() => void openExternalUrl(job.apply_url)} />
          )}

          {reporting && (
            <View style={styles.composer}>
              <TextField
                label="Report reason"
                value={reportReason}
                onChangeText={setReportReason}
                placeholder="Tell us what’s wrong with this posting"
                multiline
                numberOfLines={3}
                style={styles.multiline}
              />
              <Button
                label="Submit report"
                onPress={() => void submitReport(reportReason)}
                loading={reportSubmitting}
              />
              <Button label="Cancel" variant="ghost" onPress={() => setReporting(false)} />
            </View>
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

          {isOwner && (
            <View style={styles.ownerControls}>
              <Text style={styles.sectionTitle}>Manage posting</Text>
              <Button
                label="Edit posting"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/jobs/edit/[id]', params: { id: job.id } })
                }
              />
              <Button
                label="Close posting"
                variant="secondary"
                onPress={closePosting}
                loading={closing}
              />
              <Button label="Delete posting" variant="ghost" onPress={confirmDelete} />
            </View>
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
  scroll: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  title: { ...typography.h1, color: colors.textPrimary },
  company: { ...typography.h3, color: colors.textSecondary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.bodySmall, color: colors.textTertiary },
  composer: { gap: spacing.sm },
  multiline: { height: 96, textAlignVertical: 'top' },
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
  ownerControls: { gap: spacing.sm, marginTop: spacing.sm },
});
