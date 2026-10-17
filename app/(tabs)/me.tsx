import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { isOwnerQaBuild, ownerQaDeletionNotice } from '@/lib/qa-build';
import { useAuth } from '@/lib/auth';
import { sanitizeHttpUrl } from '@/lib/url';
import { chapterIdentity, memberScope, useChapterIdentity } from '@/lib/home';
import { hasMapLocation } from '@/lib/map-consent';
import { isAdmin } from '@/lib/types';
import { TERMS_URL, PRIVACY_URL, SUPPORT_EMAIL } from '@/lib/legal';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ReadStatus } from '@/components/ReadStatus';
import { profileCompleteness } from '@/components/ProfileNudgeCard';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/account';

export default function MeScreen() {
  const { session, profile } = useAuth();
  const scope = memberScope(profile, session?.user.id ?? null);
  return scope ? <ProfileHub key={scope} scope={scope} /> : null;
}

function ProfileHub({ scope }: { scope: string }) {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const { profile, signOut } = useAuth();
  const chapter = useChapterIdentity(scope, profile?.chapter_id ?? null);
  const reloadChapter = chapter.reload;
  useFocusEffect(
    useCallback(() => {
      reloadChapter();
    }, [reloadChapter]),
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'delete' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(false);
  const locked = useRef(false);
  const confirmation = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      confirmation.current = false;
    };
  }, []);

  async function handleSignOut() {
    if (!live.current || locked.current) return;
    locked.current = true;
    setBusy('signout');
    setError(null);
    try {
      await signOut();
    } catch {
      if (live.current) setError('Couldn’t sign out. Check your connection and try again.');
    } finally {
      if (live.current) {
        locked.current = false;
        setBusy(null);
      }
    }
  }

  async function openLink(url: string, mail = false) {
    setError(null);
    const safe = mail ? url : sanitizeHttpUrl(url);
    if (!safe) {
      setError('This link is not a valid web address. You can update it in Edit profile.');
      return;
    }
    try {
      await Linking.openURL(safe);
    } catch {
      if (live.current)
        setError(
          mail
            ? `Couldn’t open mail. Email ${SUPPORT_EMAIL}.`
            : 'Couldn’t open this link. Please try again.',
        );
    }
  }

  async function deleteAccount() {
    if (isOwnerQaBuild) {
      setError(ownerQaDeletionNotice);
      return;
    }
    if (!live.current || locked.current || !confirmation.current) return;
    confirmation.current = false;
    locked.current = true;
    setBusy('delete');
    setError(null);
    try {
      const result = await supabase.functions.invoke('delete-account', { body: {} });
      if (!live.current) return;
      if (result.error || result.data?.success !== true) throw new Error('Deletion incomplete');
      setConfirming(false);
      try {
        await signOut();
      } catch {
        if (live.current)
          setError('Your account was deleted, but sign-out could not finish. Try Sign out again.');
      }
    } catch {
      if (live.current) {
        setConfirming(false);
        setError(`Couldn’t delete your account. Try again or email ${SUPPORT_EMAIL} for help.`);
      }
    } finally {
      if (live.current) {
        locked.current = false;
        setBusy(null);
      }
    }
  }

  const { filled, total } = profileCompleteness(profile);
  const profession = profile?.job_title?.trim() || profile?.role?.trim();
  const professionalLine = [profession, profile?.company?.trim()].filter(Boolean).join(' · ');
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Me
          </Text>
          {chapter.data && <Text style={styles.meta}>{chapterIdentity(chapter.data)}</Text>}
          <ReadStatus tone="home" section={chapter} label="chapter identity" />
        </View>
        <View style={styles.section}>
          <View style={[styles.identity, (fontScale >= 1.4 || width < 350) && styles.stacked]}>
            <Avatar tone="home" uri={profile?.avatar_url} name={profile?.name} size="md" />
            <View style={styles.identityText}>
              <Text accessibilityRole="header" style={styles.name}>
                {profile?.name?.trim() || 'Member'}
              </Text>
              <View style={styles.status}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.blue} />
                <Text style={styles.approval}>Approved chapter member</Text>
              </View>
              <Text style={styles.meta}>
                {[
                  profile?.membership_type === 'alumni' ? 'Alumni' : 'Active member',
                  profile?.class_year ? `Class of ${profile.class_year}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
          {!!(professionalLine || profile?.industry?.trim() || profile?.city?.trim()) && (
            <View style={styles.professional}>
              {!!professionalLine && <Text style={styles.profession}>{professionalLine}</Text>}
              {!!(profile?.industry?.trim() || profile?.city?.trim()) && (
                <Text style={styles.meta}>
                  {[profile?.industry?.trim(), profile?.city?.trim()].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          )}
          <Button tone="home" label="Edit profile" onPress={() => router.push('/profile/edit')} />
          {filled < 4 && (
            <Text style={styles.meta}>
              {filled} of {total} profile details complete. Add a photo, professional details, bio,
              or LinkedIn to help chapter members get to know you.
            </Text>
          )}
        </View>
        {!!(
          profile?.bio?.trim() ||
          profile?.open_to_mentor ||
          profile?.is_hiring ||
          profile?.linkedin_url?.trim()
        ) && (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              About
            </Text>
            {!!profile?.bio?.trim() && <Text style={styles.body}>{profile.bio}</Text>}
            {(profile?.open_to_mentor || profile?.is_hiring) && (
              <View style={styles.signals}>
                {profile.open_to_mentor && (
                  <View style={styles.signalRow}>
                    <Ionicons name="people-outline" size={18} color={colors.blue} />
                    <Text style={styles.signal}>Open to mentorship</Text>
                  </View>
                )}
                {profile.is_hiring && (
                  <View style={styles.signalRow}>
                    <Ionicons name="briefcase-outline" size={18} color={colors.blue} />
                    <Text style={styles.signal}>Hiring</Text>
                  </View>
                )}
              </View>
            )}
            {!!profile?.linkedin_url?.trim() && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="View LinkedIn profile"
                onPress={() => void openLink(profile.linkedin_url!)}
                style={({ pressed }) => [styles.link, pressed && styles.pressed]}
              >
                <Text style={styles.linkLabel}>View LinkedIn profile</Text>
                <Ionicons name="open-outline" size={18} color={colors.blue} />
              </Pressable>
            )}
          </View>
        )}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Map privacy
          </Text>
          <View style={styles.mapSummary}>
            <Text style={[styles.meta, styles.mapLabel]}>Share city on alumni map</Text>
            <Text style={styles.consent}>
              {profile?.map_sharing_enabled === true ? 'On' : 'Off'}
            </Text>
          </View>
          <Text style={styles.meta}>
            {hasMapLocation(profile)
              ? 'Your approximate city is shared on the alumni map.'
              : profile?.map_sharing_enabled === true
                ? 'Map sharing is enabled. A pin appears only for approved alumni with a saved map location.'
                : 'Map sharing is off. Your optional profile city is separate.'}
          </Text>
          <Text style={styles.meta}>Your profile city is visible in your chapter.</Text>
          <Row
            icon="location-outline"
            label="Manage map sharing"
            onPress={() => router.push('/profile/edit')}
          />
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Account
          </Text>
          <View>
            {isAdmin(profile) && (
              <Row
                icon="shield-checkmark-outline"
                label="Admin"
                onPress={() => router.push('/(tabs)/admin')}
              />
            )}
            <Row
              icon="lock-closed-outline"
              label="Privacy Policy"
              onPress={() => void openLink(PRIVACY_URL)}
            />
            <Row
              icon="remove-circle-outline"
              label="Blocked members"
              onPress={() => router.push('/settings/blocked')}
            />
            <Row
              icon="mail-outline"
              label="Contact support"
              onPress={() => void openLink(`mailto:${SUPPORT_EMAIL}`, true)}
            />
            <Row
              icon="document-text-outline"
              label="Terms of Service"
              onPress={() => void openLink(TERMS_URL)}
            />
          </View>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <Button
            tone="home"
            label="Sign out"
            variant="secondary"
            loading={busy === 'signout'}
            disabled={busy !== null}
            onPress={() => void handleSignOut()}
          />
          {isOwnerQaBuild ? (
            <View>
              <Text style={styles.body}>Owner-only QA · Synthetic data only</Text>
              <Text style={styles.body}>{ownerQaDeletionNotice}</Text>
              <Button
                tone="home"
                label="Account deletion unavailable"
                variant="secondary"
                disabled
              />
            </View>
          ) : confirming ? (
            <Card tone="home" style={styles.confirmation}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Delete account?
              </Text>
              <Text style={styles.body}>
                This permanently deletes your account, profile, and messages. This cannot be undone.
              </Text>
              <Button
                tone="home"
                label="Cancel deletion"
                variant="secondary"
                disabled={busy !== null}
                onPress={() => {
                  confirmation.current = false;
                  setConfirming(false);
                }}
              />
              <Button
                tone="home"
                label="Permanently delete account"
                loading={busy === 'delete'}
                disabled={busy !== null}
                onPress={() => void deleteAccount()}
              />
            </Card>
          ) : (
            <Row
              icon="trash-outline"
              label="Delete account"
              destructive
              disabled={busy !== null}
              onPress={() => {
                confirmation.current = true;
                setConfirming(true);
                setError(null);
              }}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={destructive ? colors.red : colors.textSecondary} />
      <Text style={[styles.rowLabel, destructive && styles.error]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  header: {
    gap: spacing.xs,
    paddingBottom: 20,
    borderBottomWidth: 6,
    borderBottomColor: colors.gold,
  },
  title: { ...typography.h1, color: colors.blue },
  section: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.xl,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: colors.goldLight,
    borderRadius: 8,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  identityText: { flexShrink: 1, gap: spacing.xs, minWidth: 0 },
  name: { ...typography.h2, color: colors.navy },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  approval: { ...typography.bodySmall, color: colors.blue, flexShrink: 1 },
  professional: { gap: spacing.xs },
  profession: { ...typography.h3, color: colors.navy },
  meta: { ...typography.bodySmall, color: colors.textSecondary },
  body: { ...typography.body, color: colors.textPrimary },
  signals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%' },
  signal: { ...typography.bodySmall, color: colors.navy, fontWeight: '600', flexShrink: 1 },
  link: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    maxWidth: '100%',
  },
  linkLabel: { ...typography.body, color: colors.blue, fontWeight: '600', flexShrink: 1 },
  mapSummary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  mapLabel: { flexGrow: 1, flexShrink: 1 },
  consent: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
  },
  sectionTitle: { ...typography.h3, color: colors.navy },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  pressed: { backgroundColor: colors.surfaceHover },
  error: { ...typography.bodySmall, color: colors.red },
  confirmation: { gap: spacing.md },
});
