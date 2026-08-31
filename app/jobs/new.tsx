import { useState } from 'react';
import { Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { createJob } from '@/lib/jobs';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/theme';

export default function NewJobScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [applyUrl, setApplyUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!title.trim() || !company.trim()) {
      setError('Title and company are required.');
      return;
    }
    if (!profile?.chapter_id || !session?.user?.id) {
      setError('You need to be in a chapter to post a job.');
      return;
    }

    setSubmitting(true);
    const { error: err } = await createJob({
      chapterId: profile.chapter_id,
      postedBy: session.user.id,
      title: title.trim(),
      company: company.trim(),
      location: location.trim(),
      industry: industry.trim(),
      description: description.trim(),
      applyUrl: applyUrl.trim(),
    });
    setSubmitting(false);

    if (err) {
      setError(err);
      return;
    }
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Post a job" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Software Engineer" />
          <TextField label="Company" value={company} onChangeText={setCompany} placeholder="Acme Inc." />
          <TextField
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="San Francisco, CA"
          />
          <TextField
            label="Industry"
            value={industry}
            onChangeText={setIndustry}
            placeholder="Technology"
          />
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What’s the role, and who’s a good fit?"
            multiline
            numberOfLines={4}
            style={styles.multiline}
          />
          <TextField
            label="Apply link"
            value={applyUrl}
            onChangeText={setApplyUrl}
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Button label="Post job" onPress={submit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  multiline: { height: 110, textAlignVertical: 'top' },
  error: { ...typography.bodySmall, color: colors.red, marginBottom: spacing.lg },
});
