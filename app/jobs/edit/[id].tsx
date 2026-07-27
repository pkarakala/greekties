import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useJob, updateJob } from '@/lib/jobs';
import { isAdmin } from '@/lib/types';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/theme';

export default function EditJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile: me } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const { loading, job } = useJob(id ?? null);

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [applyUrl, setApplyUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Prefill once from the loaded posting (don't clobber in-progress edits).
  useEffect(() => {
    if (!job || hydrated) return;
    setTitle(job.title);
    setCompany(job.company);
    setLocation(job.location ?? '');
    setIndustry(job.industry ?? '');
    setDescription(job.description ?? '');
    setApplyUrl(job.apply_url ?? '');
    setHydrated(true);
  }, [job, hydrated]);

  const allowed = !!job && !!myUserId && (job.posted_by === myUserId || isAdmin(me));

  async function submit() {
    if (!job) return;
    setError(null);
    if (!title.trim() || !company.trim()) {
      setError('Title and company are required.');
      return;
    }

    setSubmitting(true);
    const { error: err } = await updateJob(job.id, {
      title: title.trim(),
      company: company.trim(),
      location: location.trim() || null,
      industry: industry.trim() || null,
      description: description.trim() || null,
      apply_url: applyUrl.trim() || null,
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
      <ScreenHeader title="Edit posting" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !job ? (
        <View style={styles.center}>
          <Text style={styles.muted}>This posting couldn’t be found.</Text>
        </View>
      ) : !allowed ? (
        <View style={styles.center}>
          <Text style={styles.muted}>
            Only the member who posted this job or a chapter admin can edit it.
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextField
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="Software Engineer"
            />
            <TextField
              label="Company"
              value={company}
              onChangeText={setCompany}
              placeholder="Acme Inc."
            />
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

            <Button label="Save changes" onPress={submit} loading={submitting} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  multiline: { height: 110, textAlignVertical: 'top' },
  error: { ...typography.bodySmall, color: colors.red, marginBottom: spacing.lg },
});
