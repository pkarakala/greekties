import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { memberScope } from '@/lib/home';
import { findRequestBetween, createMentorshipRequest } from '@/lib/mentorship';
import { blockUser, canShowActorContent, reportContent } from '@/lib/moderation';
import { openExternalUrl } from '@/lib/url';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/network';
import type { MentorshipRequest, Profile } from '@/lib/types';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile, blockedIds } = useAuth();
  const scope = memberScope(profile, session?.user.id ?? null);
  return (
    <ProfileContent
      key={JSON.stringify([id, scope, [...blockedIds].sort()])}
      authorized={!!scope}
    />
  );
}

function ProfileContent({ authorized }: { authorized: boolean }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile: me, blockedIds } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(authorized);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [existing, setExisting] = useState<MentorshipRequest | null>(null);

  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);

  // Mentorship request composer.
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Report composer (Android — iOS uses Alert.prompt).
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (authorized)
      void (async () => {
        try {
          const { data, error: readError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .maybeSingle();
          if (!mounted) return;
          if (readError) throw new Error('Profile unavailable');
          const fetched = (data as Profile) ?? null;
          const p = fetched && canShowActorContent(fetched.user_id, blockedIds) ? fetched : null;
          setProfile(p);
          setExisting(null);
          if (p && myUserId && p.user_id !== myUserId) {
            const request = await findRequestBetween(myUserId, p.user_id);
            if (!mounted) return;
            setExisting(request);
          }
        } catch {
          if (mounted) {
            setProfile(null);
            setExisting(null);
            setLoadError(true);
          }
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    return () => {
      mounted = false;
    };
  }, [id, myUserId, blockedIds, revision, authorized]);

  const isSelf = !!profile && profile.user_id === myUserId;
  const isBlockedProfile = !!profile && !canShowActorContent(profile.user_id, blockedIds);

  async function submitRequest() {
    if (!profile || !myUserId || !me?.chapter_id || submitting) return;
    if (!message.trim()) {
      setError('Add a short intro message.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const { id: newId, error: reqError } = await createMentorshipRequest({
      fromUserId: myUserId,
      toUserId: profile.user_id,
      chapterId: me.chapter_id,
      message: message.trim(),
    });
    setSubmitting(false);

    if (reqError) {
      setError(reqError);
      return;
    }
    if (newId) router.replace({ pathname: '/inbox/[requestId]', params: { requestId: newId } });
  }

  // ── Moderation (report / block) ────────────────────────────────────────────

  async function submitReport(reason: string) {
    if (!profile || !myUserId) return;
    if (!reason.trim()) return;
    setReportSubmitting(true);
    const { error: reportError } = await reportContent({
      reporterId: myUserId,
      chapterId: me?.chapter_id ?? null,
      targetType: 'profile',
      targetId: profile.id,
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
        'Report member',
        'Tell us what’s wrong with this profile.',
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

  function confirmBlock() {
    if (!profile || !myUserId) return;
    Alert.alert(
      `Block ${profile.name ?? 'this member'}?`,
      'You won’t see their profile or messages anymore.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const { error: blockError } = await blockUser(myUserId, profile.user_id);
            if (blockError) Alert.alert('Couldn’t block', blockError);
            else router.back();
          },
        },
      ],
    );
  }

  function showModerationMenu() {
    Alert.alert(profile?.name ?? 'Member', undefined, [
      { text: 'Report member', style: 'destructive', onPress: startReport },
      { text: 'Block member', style: 'destructive', onPress: confirmBlock },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function renderAction() {
    if (isSelf || !profile) return null;

    if (existing) {
      if (existing.status === 'accepted') {
        return (
          <Button
            tone="home"
            label="Open conversation"
            onPress={() =>
              router.push({ pathname: '/inbox/[requestId]', params: { requestId: existing.id } })
            }
          />
        );
      }
      if (existing.status === 'pending') {
        return (
          <Button
            tone="home"
            label="Request pending"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/inbox/[requestId]', params: { requestId: existing.id } })
            }
          />
        );
      }
      // declined → allow trying again
    }

    if (!profile.open_to_mentor) return null;

    if (!composing) {
      return <Button tone="home" label="Request mentorship" onPress={() => setComposing(true)} />;
    }

    return (
      <View style={styles.composer}>
        <TextField
          tone="home"
          label="Intro message"
          value={message}
          onChangeText={setMessage}
          placeholder="Hi! I’d love your guidance on…"
          multiline
          numberOfLines={3}
          style={styles.multiline}
        />
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <Button tone="home" label="Send request" onPress={submitRequest} loading={submitting} />
        <Button tone="home" label="Cancel" variant="ghost" onPress={() => setComposing(false)} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        tone="home"
        title=""
        onBack={() => router.back()}
        right={
          !isSelf && profile && !isBlockedProfile
            ? {
                accessibilityLabel: 'Member options',
                icon: 'ellipsis-horizontal',
                onPress: showModerationMenu,
              }
            : undefined
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !profile || isBlockedProfile ? (
        <View style={styles.center}>
          <Text style={styles.muted}>
            {loadError
              ? 'Couldn’t load this member. Please retry.'
              : 'This member couldn’t be found.'}
          </Text>
          {loadError && (
            <Button
              tone="home"
              label="Retry profile"
              onPress={() => {
                setLoading(true);
                setLoadError(false);
                setRevision((value) => value + 1);
              }}
            />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.identity}>
            <Avatar tone="home" uri={profile.avatar_url} name={profile.name} size="lg" />
            <Text accessibilityRole="header" style={styles.name}>
              {profile.name ?? 'Member'}
            </Text>
            {!!(profile.job_title || profile.company) && (
              <Text style={styles.role}>
                {[profile.job_title, profile.company].filter(Boolean).join(' at ')}
              </Text>
            )}
            <View style={styles.badges}>
              {profile.open_to_mentor && <Badge appearance="home" label="Mentor" tone="gold" />}
              {profile.is_hiring && <Badge appearance="home" label="Hiring" tone="green" />}
              {profile.membership_type === 'alumni' && <Badge appearance="home" label="Alumni" />}
            </View>
          </View>

          {renderAction()}

          {reporting && (
            <View style={styles.composer}>
              <TextField
                tone="home"
                label="Report reason"
                value={reportReason}
                onChangeText={setReportReason}
                placeholder="Tell us what’s wrong with this profile"
                multiline
                numberOfLines={3}
                style={styles.multiline}
              />
              <Button
                tone="home"
                label="Submit report"
                onPress={() => void submitReport(reportReason)}
                loading={reportSubmitting}
              />
              <Button
                tone="home"
                label="Cancel"
                variant="ghost"
                onPress={() => setReporting(false)}
              />
            </View>
          )}

          {!!profile.linkedin_url && (
            <Button
              tone="home"
              label="View LinkedIn"
              variant="secondary"
              onPress={() => void openExternalUrl(profile.linkedin_url)}
            />
          )}

          <View style={styles.facts}>
            <Fact icon="school-outline" label="Class" value={profile.class_year?.toString()} />
            <Fact icon="business-outline" label="Industry" value={profile.industry} />
            <Fact icon="location-outline" label="City" value={profile.city} />
          </View>

          {!!profile.bio && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.bio}>{profile.bio}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={18} color={colors.textTertiary} />
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { padding: 20, flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.body, color: colors.textSecondary },
  scroll: { padding: 20, gap: spacing.lg },
  identity: {
    backgroundColor: colors.goldLight,
    borderTopWidth: 6,
    borderTopColor: colors.gold,
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  name: { ...typography.h1, color: colors.blue, textAlign: 'center', marginTop: spacing.sm },
  role: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  composer: { gap: spacing.sm, borderLeftWidth: 4, borderLeftColor: colors.gold, paddingLeft: 12 },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  error: { ...typography.bodySmall, color: colors.red },
  facts: { gap: spacing.md, marginTop: spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  factLabel: { ...typography.bodySmall, color: colors.textTertiary, width: 72 },
  factValue: { ...typography.body, color: colors.textPrimary, flex: 1 },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  bio: { ...typography.body, color: colors.textSecondary },
});
