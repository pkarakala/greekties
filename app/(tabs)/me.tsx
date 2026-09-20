import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
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
import { colors, spacing, typography } from '@/theme';

export default function MeScreen() {
  const { session, profile } = useAuth();
  const scope = memberScope(profile, session?.user.id ?? null);
  return scope ? <ProfileHub key={scope} scope={scope} /> : null;
}

function ProfileHub({ scope }: { scope: string }) {
  const router = useRouter();
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
    if (!live.current || locked.current || !confirmation.current) return;
    confirmation.current = false;
    locked.current = true;
    setBusy('delete');
    setError(null);
    try {
      const result = await supabase.rpc('delete_own_account');
      if (!live.current) return;
      if (result.error) throw result.error;
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
        <Text accessibilityRole="header" style={styles.title}>
          Me
        </Text>
        <View style={styles.profile}>
          <Avatar uri={profile?.avatar_url} name={profile?.name} size="lg" />
          <Text accessibilityRole="header" style={styles.name}>
            {profile?.name || 'Member'}
          </Text>
          {chapter.data && <Text style={styles.meta}>{chapterIdentity(chapter.data)}</Text>}
          <ReadStatus section={chapter} label="chapter identity" />
          <Text style={styles.meta}>
            {[
              profile?.membership_type === 'alumni' ? 'Alumni' : 'Active member',
              profile?.class_year ? `Class of ${profile.class_year}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {!!professionalLine && <Text style={styles.profession}>{professionalLine}</Text>}
          {!!profile?.industry?.trim() && <Text style={styles.meta}>{profile.industry}</Text>}
          {!!profile?.city?.trim() && <Text style={styles.meta}>{profile.city}</Text>}
          {!!profile?.bio?.trim() && <Text style={styles.body}>{profile.bio}</Text>}
          {(profile?.open_to_mentor || profile?.is_hiring) && (
            <View style={styles.signals}>
              {profile.open_to_mentor && <Text style={styles.signal}>Open to mentorship</Text>}
              {profile.is_hiring && <Text style={styles.signal}>Hiring</Text>}
            </View>
          )}
          {!!profile?.linkedin_url?.trim() && (
            <Button
              label="View LinkedIn profile"
              variant="ghost"
              onPress={() => void openLink(profile.linkedin_url!)}
            />
          )}
        </View>
        <Button label="Edit profile" onPress={() => router.push('/profile/edit')} />
        {filled < 4 && (
          <Text style={styles.meta}>
            {filled} of {total} profile details complete. Add a photo, professional details, bio, or
            LinkedIn to help chapter members get to know you.
          </Text>
        )}
        <View style={styles.mapNote}>
          <Text style={styles.meta}>
            {hasMapLocation(profile)
              ? 'Your approximate city is shared on the alumni map.'
              : profile?.map_sharing_enabled === true
                ? 'Map sharing is enabled. A pin appears only for approved alumni with a saved map location.'
                : 'Map sharing is off. Your optional profile city is separate.'}
          </Text>
          <Button
            label="Manage map sharing"
            variant="ghost"
            onPress={() => router.push('/profile/edit')}
          />
        </View>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Account
        </Text>
        <Card style={styles.rows}>
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
        </Card>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <Button
          label="Sign out"
          variant="secondary"
          loading={busy === 'signout'}
          disabled={busy !== null}
          onPress={() => void handleSignOut()}
        />
        {confirming ? (
          <Card style={styles.confirmation}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Delete account?
            </Text>
            <Text style={styles.body}>
              This permanently deletes your account, profile, and messages. This cannot be undone.
            </Text>
            <Button
              label="Cancel deletion"
              variant="secondary"
              disabled={busy !== null}
              onPress={() => {
                confirmation.current = false;
                setConfirming(false);
              }}
            />
            <Button
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
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  title: { ...typography.h1, color: colors.navy },
  profile: { gap: spacing.sm, alignItems: 'flex-start' },
  name: { ...typography.h2, color: colors.navy },
  profession: { ...typography.h3, color: colors.navy, marginTop: spacing.sm },
  meta: { ...typography.bodySmall, color: colors.textSecondary },
  body: { ...typography.body, color: colors.textPrimary },
  signals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.sm },
  signal: { ...typography.bodySmall, color: colors.gold, fontWeight: '600' },
  mapNote: {
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.lg,
  },
  sectionTitle: { ...typography.h3, color: colors.navy },
  rows: { padding: 0 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  rowLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  pressed: { backgroundColor: colors.surfaceHover },
  error: { ...typography.bodySmall, color: colors.red },
  confirmation: { gap: spacing.md },
});
