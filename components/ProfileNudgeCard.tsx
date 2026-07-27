import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Profile } from '@/lib/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';

// The profile fields that make a member findable — an avatar, a city (map
// pin), an industry, a role or job title, a bio, and a LinkedIn link.
const NUDGE_TOTAL = 6;

/**
 * Count how many of the fields that make a profile useful are filled.
 * Role and job title count as one field — either satisfies "what you do".
 */
export function profileCompleteness(profile: Profile | null): {
  filled: number;
  total: number;
} {
  if (!profile) return { filled: 0, total: NUDGE_TOTAL };

  const filledChecks = [
    !!profile.avatar_url,
    !!profile.city?.trim(),
    !!profile.industry?.trim(),
    !!(profile.job_title?.trim() || profile.role?.trim()),
    !!profile.bio?.trim(),
    !!profile.linkedin_url?.trim(),
  ];
  return { filled: filledChecks.filter(Boolean).length, total: NUDGE_TOTAL };
}

/**
 * Home-screen nudge shown while a profile is mostly empty (< 4 of 6 fields).
 * An empty profile makes the directory, map, and mentorship inert — this
 * keeps a gentle pointer to /profile/edit until the basics are in.
 */
export function ProfileNudgeCard({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const { filled, total } = profileCompleteness(profile);

  if (!profile || filled >= 4) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="person-circle-outline" size={18} color={colors.gold} />
        <Text style={styles.title}>Complete your profile</Text>
      </View>
      <Text style={styles.blurb}>
        A finished profile helps brothers find you for jobs, mentorship, and meetups.
      </Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(filled / total) * 100}%` }]} />
      </View>
      <Text style={styles.progressLabel}>
        {filled} of {total} complete
      </Text>

      <Button
        label="Finish my profile"
        variant="secondary"
        onPress={() => router.push('/profile/edit')}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.h3, color: colors.textPrimary },
  blurb: { ...typography.bodySmall, color: colors.textSecondary },
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHover,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.gold,
  },
  progressLabel: { ...typography.caption, color: colors.textTertiary },
});
