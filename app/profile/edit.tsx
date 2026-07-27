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

export default function EditProfileScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();

  const [name, setName] = useState(profile?.name ?? '');
  const [classYear, setClassYear] = useState(profile?.class_year?.toString() ?? '');
  const [role, setRole] = useState(profile?.role ?? '');
  const [industry, setIndustry] = useState(profile?.industry ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [company, setCompany] = useState(profile?.company ?? '');
  const [jobTitle, setJobTitle] = useState(profile?.job_title ?? '');
  const [linkedinUrl, setLinkedinUrl] = useState(profile?.linkedin_url ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [openToMentor, setOpenToMentor] = useState(!!profile?.open_to_mentor);
  const [isHiring, setIsHiring] = useState(!!profile?.is_hiring);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changePhoto() {
    if (!session?.user?.id) return;
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo access in Settings to change your picture.');
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

    const linkedin = linkedinUrl.trim();
    if (linkedin && !linkedin.startsWith('https://')) {
      setError('LinkedIn URL must start with https://');
      return;
    }
    const year = classYear.trim() ? parseInt(classYear.trim(), 10) : null;
    if (classYear.trim() && !Number.isFinite(year)) {
      setError('Class year must be a number.');
      return;
    }

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
      name: name.trim() || null,
      class_year: year,
      role: role.trim() || null,
      industry: industry.trim() || null,
      city: trimmedCity || null,
      company: company.trim() || null,
      job_title: jobTitle.trim() || null,
      linkedin_url: linkedin || null,
      bio: bio.trim() || null,
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
    router.back();
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Edit profile" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.muted}>Join a chapter to set up your profile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Edit profile" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarSection}>
            <Avatar uri={avatarUrl} name={name || profile.name} size="lg" />
            <Pressable onPress={changePhoto} disabled={uploading} hitSlop={8}>
              {uploading ? (
                <ActivityIndicator color={colors.gold} />
              ) : (
                <Text style={styles.changePhoto}>Change photo</Text>
              )}
            </Pressable>
          </View>

          <TextField label="Name" value={name} onChangeText={setName} placeholder="Your full name" />
          <TextField
            label="Class year"
            value={classYear}
            onChangeText={setClassYear}
            placeholder="2024"
            keyboardType="number-pad"
            maxLength={4}
          />
          <TextField label="Role" value={role} onChangeText={setRole} placeholder="Active or Alumni" />
          <TextField
            label="Industry"
            value={industry}
            onChangeText={setIndustry}
            placeholder="Technology"
          />
          <TextField label="City" value={city} onChangeText={setCity} placeholder="Austin, TX" />
          <Text style={styles.fieldHint}>Your city places you on the alumni map.</Text>
          <TextField label="Company" value={company} onChangeText={setCompany} placeholder="Acme Inc." />
          <TextField
            label="Job title"
            value={jobTitle}
            onChangeText={setJobTitle}
            placeholder="Software Engineer"
          />
          <TextField
            label="LinkedIn URL"
            value={linkedinUrl}
            onChangeText={setLinkedinUrl}
            placeholder="https://linkedin.com/in/…"
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="A few lines about you"
            multiline
            numberOfLines={4}
            style={styles.multiline}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.body, color: colors.textSecondary },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  avatarSection: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  changePhoto: { ...typography.h3, color: colors.gold },
  multiline: { height: 110, textAlignVertical: 'top' },
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
});
