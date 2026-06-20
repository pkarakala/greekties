import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { findRequestBetween, createMentorshipRequest } from '@/lib/mentorship';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, radius, spacing, typography } from '@/theme';
import type { MentorshipRequest, Profile } from '@/lib/types';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile: me } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [existing, setExisting] = useState<MentorshipRequest | null>(null);

  // Mentorship request composer.
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!mounted) return;
      const p = (data as Profile) ?? null;
      setProfile(p);

      if (p && myUserId && p.user_id !== myUserId) {
        setExisting(await findRequestBetween(myUserId, p.user_id));
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [id, myUserId]);

  const isSelf = !!profile && profile.user_id === myUserId;

  async function submitRequest() {
    if (!profile || !myUserId || !me?.chapter_id) return;
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

  function renderAction() {
    if (isSelf || !profile) return null;

    if (existing) {
      if (existing.status === 'accepted') {
        return (
          <Button
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
      return <Button label="Request mentorship" onPress={() => setComposing(true)} />;
    }

    return (
      <View style={styles.composer}>
        <TextField
          label="Intro message"
          value={message}
          onChangeText={setMessage}
          placeholder="Hi! I’d love your guidance on…"
          multiline
          numberOfLines={3}
          style={styles.multiline}
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button label="Send request" onPress={submitRequest} loading={submitting} />
        <Button label="Cancel" variant="ghost" onPress={() => setComposing(false)} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={styles.muted}>This member couldn’t be found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.identity}>
            <Avatar uri={profile.avatar_url} name={profile.name} size="lg" />
            <Text style={styles.name}>{profile.name ?? 'Member'}</Text>
            {!!(profile.job_title || profile.company) && (
              <Text style={styles.role}>
                {[profile.job_title, profile.company].filter(Boolean).join(' at ')}
              </Text>
            )}
            <View style={styles.badges}>
              {profile.open_to_mentor && <Badge label="Mentor" tone="gold" />}
              {profile.is_hiring && <Badge label="Hiring" tone="green" />}
              {profile.role === 'Alumni' && <Badge label="Alumni" />}
            </View>
          </View>

          {renderAction()}

          {!!profile.linkedin_url && (
            <Button
              label="View LinkedIn"
              variant="secondary"
              onPress={() => Linking.openURL(profile.linkedin_url as string).catch(() => {})}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.body, color: colors.textSecondary },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  identity: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  name: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.sm },
  role: { ...typography.body, color: colors.textSecondary },
  badges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  composer: { gap: spacing.sm },
  multiline: { height: 96, textAlignVertical: 'top' },
  error: { ...typography.bodySmall, color: colors.red },
  facts: { gap: spacing.md, marginTop: spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  factLabel: { ...typography.bodySmall, color: colors.textTertiary, width: 72 },
  factValue: { ...typography.body, color: colors.textPrimary, flex: 1 },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  bio: { ...typography.body, color: colors.textSecondary },
});
