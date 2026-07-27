import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/lib/auth';
import { geocodeCity } from '@/lib/geocode';
import { updateProfile, uploadAvatar } from '@/lib/profile';
import type { Profile } from '@/lib/types';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { colors, spacing, typography } from '@/theme';

/**
 * Post-join profile setup: one friendly screen shown right after joining or
 * creating a chapter. An empty profile makes the directory/map/mentorship
 * inert, so we ask for the highest-leverage fields up front — always
 * skippable, and everything is editable later in /profile/edit.
 */
export default function CompleteProfileScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();

  const [city, setCity] = useState(profile?.city ?? '');
  const [industry, setIndustry] = useState(profile?.industry ?? '');
  const [jobTitle, setJobTitle] = useState(profile?.job_title ?? '');
  const [openToMentor, setOpenToMentor] = useState(!!profile?.open_to_mentor);
  const [isHiring, setIsHiring] = useState(!!profile?.is_hiring);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function skip() {
    router.replace('/');
  }

  async function changePhoto() {
    if (!session?.user?.id) return;
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo access in Settings to add your picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    setUploading(true);
    const { url, error: uploadError } = await uploadAvatar(session.user.id, result.assets[0].uri);
    setUploading(false);

    if (uploadError) {
      setError(uploadError);
      return;
    }
    // Saved with the rest of the form — the Save button commits avatar_url too.
    setAvatarUrl(url);
  }

  async function save() {
    if (!profile) return;
    setError(null);
    setSaving(true);

    // Geocode the city so the alumni map can place a pin. Best-effort — a
    // failed lookup never blocks the save (the map just won't show a pin).
    const trimmedCity = city.trim();
    const coordFields: Partial<Profile> = {};
    if (!trimmedCity) {
      coordFields.lat = null;
      coordFields.lng = null;
    } else if (trimmedCity !== profile.city || profile.lat == null) {
      const coords = await geocodeCity(trimmedCity);
      if (coords) {
        coordFields.lat = coords.lat;
        coordFields.lng = coords.lng;
      }
    }

    const { error: saveError } = await updateProfile(profile.id, {
      city: trimmedCity || null,
      industry: industry.trim() || null,
      job_title: jobTitle.trim() || null,
      open_to_mentor: openToMentor,
      is_hiring: isHiring,
      avatar_url: avatarUrl,
      ...coordFields,
    });
    setSaving(false);

    if (saveError) {
      setError('Couldn’t save your profile. Please try again.');
      return;
    }
    await refreshProfile();
    router.replace('/');
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Set up your profile" />
        <View style={styles.center}>
          <Text style={styles.muted}>Join a chapter to set up your profile.</Text>
          <Pressable onPress={skip} hitSlop={8}>
            <Text style={styles.skip}>Go home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Set up your profile" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>Help your brothers find you.</Text>

          <View style={styles.avatarSection}>
            <Avatar uri={avatarUrl} name={profile.name} size="lg" />
            <Pressable onPress={changePhoto} disabled={uploading} hitSlop={8}>
              {uploading ? (
                <ActivityIndicator color={colors.gold} />
              ) : (
                <Text style={styles.changePhoto}>
                  {avatarUrl ? 'Change photo' : 'Add a photo'}
                </Text>
              )}
            </Pressable>
          </View>

          <TextField label="City" value={city} onChangeText={setCity} placeholder="Austin, TX" />
          <Text style={styles.fieldHint}>Your city places you on the alumni map.</Text>
          <TextField
            label="Industry"
            value={industry}
            onChangeText={setIndustry}
            placeholder="Technology"
          />
          <TextField
            label="Role / job title"
            value={jobTitle}
            onChangeText={setJobTitle}
            placeholder="Software Engineer"
          />

          <ToggleRow
            label="Open to mentor"
            hint="Members can send you mentorship requests."
            value={openToMentor}
            onChange={setOpenToMentor}
          />
          <ToggleRow
            label="Currently hiring"
            hint="Shows a Hiring badge on your profile."
            value={isHiring}
            onChange={setIsHiring}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Button label="Save" onPress={save} loading={saving} />

          <Pressable onPress={skip} hitSlop={8} style={styles.skipWrap}>
            <Text style={styles.skip}>Skip for now</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceElevated, true: colors.gold }}
        thumbColor={colors.textPrimary}
        ios_backgroundColor={colors.surfaceElevated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  avatarSection: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  changePhoto: { ...typography.h3, color: colors.gold },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  toggleLabel: { ...typography.h3, color: colors.textPrimary },
  toggleHint: { ...typography.bodySmall, color: colors.textSecondary },
  // Tucks under the City field (TextField carries its own bottom margin).
  fieldHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
  error: { ...typography.bodySmall, color: colors.red, marginBottom: spacing.lg },
  skipWrap: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  skip: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
});
