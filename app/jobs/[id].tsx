import { ShareToChat } from '@/components/ShareToChat';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { canShowActorContent, reportContent } from '@/lib/moderation';
import { jobApplicationState, openJobApplication } from '@/lib/job-application';
import { isAdmin } from '@/lib/types';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { TextField } from '@/components/TextField';
import { timeAgoShort } from '@/lib/time';
import { colors, radius, spacing, typography } from '@/theme';
import type { Profile } from '@/lib/types';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile, blockedIds } = useAuth();
  return (
    <JobDetailContent
      key={JSON.stringify([
        id,
        session?.user.id,
        profile?.chapter_id,
        profile?.status,
        profile?.admin_role,
        [...blockedIds].sort(),
      ])}
    />
  );
}
function JobDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile: me, blockedIds } = useAuth();
  const myUserId = session?.user?.id ?? null;
  const { loading, error: loadError, job, reload } = useJob(id ?? null, blockedIds);
  const [poster, setPoster] = useState<Pick<Profile, 'id' | 'name' | 'avatar_url'> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const actionGuard = useRef(false);
  const confirmRef = useRef(false);
  const live = useRef(true);
  const focusVersion = useRef(0);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
      return () => {
        focusVersion.current++;
        confirmRef.current = false;
        setDeleteConfirmation(false);
      };
    }, [reload]),
  );
  async function apply() {
    if (!job || loading || loadError || actionGuard.current || !live.current) return;
    actionGuard.current = true;
    setApplying(true);
    const error = await openJobApplication(job);
    if (!live.current) return;
    actionGuard.current = false;
    setApplying(false);
    setActionError(error);
  }

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
      .select('id, name, avatar_url')
      .eq('user_id', job.posted_by)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (mounted) setPoster(data ?? null);
        },
        () => {
          if (mounted) setPoster(null);
        },
      );
    return () => {
      mounted = false;
    };
  }, [job?.posted_by]);

  useEffect(() => {
    if (loading || loadError || !job) {
      confirmRef.current = false;
      setDeleteConfirmation(false);
    }
  }, [loading, loadError, job]);
  const isBlockedPosting = !!job && !canShowActorContent(job.posted_by, blockedIds);
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

  async function managePosting(remove: boolean) {
    if (!job || !isOwner || actionGuard.current || !live.current || (remove && !confirmRef.current))
      return;
    const focus = focusVersion.current;
    actionGuard.current = true;
    confirmRef.current = false;
    setClosing(true);
    try {
      const query = remove
        ? supabase.from('job_postings').delete()
        : supabase.from('job_postings').update({ is_open: false });
      const result = await query.eq('id', job.id).select('id').maybeSingle();
      if (!live.current || focus !== focusVersion.current) return;
      if (result.error || result.data?.id !== job.id)
        setActionError('Couldn’t confirm the change. Refresh the posting and try again.');
      else if (remove) router.back();
      else reload();
    } catch {
      if (live.current)
        setActionError('Couldn’t confirm the change. Refresh the posting and try again.');
    } finally {
      if (live.current) {
        actionGuard.current = false;
        setClosing(false);
        setDeleteConfirmation(false);
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title=""
        onBack={() => router.back()}
        right={
          job && myUserId && !isOwner && !isBlockedPosting
            ? { icon: 'ellipsis-horizontal', onPress: startReport }
            : undefined
        }
      />

      {loading && !job ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !job || isBlockedPosting ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{loadError ?? 'This posting is removed or unavailable.'}</Text>
          {!!loadError && <Button label="Retry" onPress={reload} />}
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

          {loading && <Text style={styles.muted}>Refreshing…</Text>}
          {!!loadError && (
            <View>
              <Text style={styles.muted}>{loadError} Showing saved details.</Text>
              <Button label="Retry" onPress={reload} />
            </View>
          )}
          {jobApplicationState(job).url ? (
            <Button
              label="Apply"
              onPress={apply}
              loading={applying}
              disabled={loading || !!loadError}
            />
          ) : (
            <Text style={styles.muted}>{jobApplicationState(job).message}</Text>
          )}
          {!!actionError && (
            <Text accessibilityRole="alert" style={styles.muted}>
              {actionError}
            </Text>
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

          <ShareToChat resource={{ kind: 'jobs', id: job.id }} />

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
                disabled={closing || loading || !!loadError}
                variant="secondary"
                onPress={() => router.push({ pathname: '/jobs/edit/[id]', params: { id: job.id } })}
              />
              <Button
                label="Close posting"
                disabled={job.is_open === false || !!loadError}
                variant="secondary"
                onPress={() => managePosting(false)}
                loading={closing}
              />
              {deleteConfirmation && (
                <View style={styles.section}>
                  <Text style={styles.muted}>Permanently delete this posting?</Text>
                  <Button
                    label="Cancel deletion"
                    variant="secondary"
                    disabled={closing}
                    onPress={() => {
                      confirmRef.current = false;
                      setDeleteConfirmation(false);
                    }}
                  />
                  <Button
                    label="Permanently delete posting"
                    loading={closing}
                    onPress={() => managePosting(true)}
                  />
                </View>
              )}
              <Button
                disabled={closing || loading || !!loadError}
                label="Delete posting"
                variant="ghost"
                onPress={() => {
                  confirmRef.current = true;
                  setDeleteConfirmation(true);
                }}
              />
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
