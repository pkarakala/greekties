import { useState } from 'react';
import { Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { createChapter } from '@/lib/chapters';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/account';

export default function CreateChapterScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [university, setUniversity] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setError(null);
    setNameError(null);

    if (!name.trim()) {
      setNameError('Chapter name is required.');
      return;
    }

    setSaving(true);
    const { chapterId, error: createError } = await createChapter({
      name,
      designation: designation.trim() || undefined,
      university: university.trim() || undefined,
    });

    if (createError || !chapterId) {
      setSaving(false);
      setError(createError ?? 'Couldn’t create your chapter. Please try again.');
      return;
    }

    await refreshProfile();
    setSaving(false);
    // Founder just created the chapter → capture their profile basics now.
    router.replace('/onboarding/complete-profile');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader tone="home" title="Create your chapter" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hint}>
            You’ll become the chapter’s first owner and can invite everyone else.
          </Text>

          <TextField
            tone="home"
            label="Chapter name"
            value={name}
            onChangeText={setName}
            placeholder="Beta Theta Pi"
            autoCapitalize="words"
            errorText={nameError ?? undefined}
          />
          <TextField
            tone="home"
            label="Designation (optional)"
            value={designation}
            onChangeText={setDesignation}
            placeholder="Alpha Phi"
            autoCapitalize="words"
          />
          <TextField
            tone="home"
            label="University (optional)"
            value={university}
            onChangeText={setUniversity}
            placeholder="University of Georgia"
            autoCapitalize="words"
          />

          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}

          <Button tone="home" label="Create chapter" onPress={handleCreate} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: 20, gap: spacing.md, paddingBottom: spacing.xxxl },
  hint: {
    ...typography.body,
    color: colors.navy,
    backgroundColor: colors.goldLight,
    borderTopWidth: 6,
    borderTopColor: colors.gold,
    padding: 16,
    marginBottom: spacing.md,
  },
  error: { ...typography.bodySmall, color: colors.red },
});
