import { useEffect, useRef, useState } from 'react';
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
import { saveProfileWithMap, uploadAvatar } from '@/lib/profile';
import { MapConsentField } from '@/components/MapConsentField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/account';

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
  const [mapSharing, setMapSharing] = useState(profile?.map_sharing_enabled === true);
  // A background refresh must not attach a stale form's consent to a newer
  // server revision (for example, an opt-out from another session).
  const mapRevision = useRef(profile?.map_revision);
  const mounted = useRef(true);
  const savingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
    if (!profile || savingRef.current) return;
    setError(null);
    savingRef.current = true;
    setSaving(true);
    const { error: saveError, revision } = await saveProfileWithMap(
      { ...profile, map_revision: mapRevision.current },
      {
        industry: industry.trim() || null,
        job_title: jobTitle.trim() || null,
        open_to_mentor: openToMentor,
        is_hiring: isHiring,
        avatar_url: avatarUrl,
      },
      city,
      mapSharing,
      () => mounted.current,
    );
    if (revision) mapRevision.current = revision;
    await refreshProfile();
    savingRef.current = false;
    if (!mounted.current) return;
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    if (!city.trim()) setMapSharing(false);
    router.replace('/');
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader tone="home" title="Set up your profile" />
        <View style={styles.center}>
          <Text style={styles.muted}>Join a chapter to set up your profile.</Text>
          <Pressable accessibilityRole="button" onPress={skip} hitSlop={8} style={styles.skipWrap}>
            <Text style={styles.skip}>Go home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader tone="home" title="Set up your profile" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>Help your chapter members find you.</Text>

          <View style={styles.avatarSection}>
            <Avatar tone="home" uri={avatarUrl} name={profile.name} size="lg" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={avatarUrl ? 'Change photo' : 'Add a photo'}
              style={styles.photoControl}
              onPress={changePhoto}
              disabled={uploading}
              hitSlop={8}
            >
              {uploading ? (
                <ActivityIndicator color={colors.blue} />
              ) : (
                <Text style={styles.changePhoto}>{avatarUrl ? 'Change photo' : 'Add a photo'}</Text>
              )}
            </Pressable>
          </View>

          <TextField
            tone="home"
            label="City (optional)"
            accessibilityLabel="City (optional)"
            value={city}
            onChangeText={setCity}
            editable={!saving}
            placeholder="Austin, TX"
          />
          <MapConsentField
            enabled={mapSharing}
            onChange={setMapSharing}
            disabled={saving}
            available={!!profile.map_revision && typeof profile.map_sharing_enabled === 'boolean'}
          />
          <TextField
            tone="home"
            label="Industry"
            value={industry}
            onChangeText={setIndustry}
            placeholder="Technology"
          />
          <TextField
            tone="home"
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

          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}

          <Button tone="home" label="Save" onPress={save} loading={saving} />

          <Pressable accessibilityRole="button" onPress={skip} hitSlop={8} style={styles.skipWrap}>
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
        style={{ minWidth: 56, minHeight: 48 }}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.borderStrong, true: colors.blue }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.borderStrong}
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
    paddingHorizontal: 20,
  },
  muted: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  scroll: { padding: 20, paddingBottom: spacing.xxxl },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  avatarSection: {
    padding: 16,
    backgroundColor: colors.goldLight,
    borderTopWidth: 6,
    borderTopColor: colors.gold,
    borderRadius: 8,
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  photoControl: { minHeight: 48, minWidth: 48, justifyContent: 'center' },
  changePhoto: { ...typography.h3, color: colors.blue },
  toggleRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  toggleLabel: { ...typography.h3, color: colors.textPrimary },
  toggleHint: { ...typography.bodySmall, color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.red, marginBottom: spacing.lg },
  skipWrap: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: spacing.lg,
    padding: spacing.sm,
  },
  skip: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
});
