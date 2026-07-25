import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Wordmark } from '@/components/Wordmark';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, spacing, typography } from '@/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: 'greekties://reset-password' },
    );
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice('Check your email for a reset link.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Wordmark size={36} />
            <Text style={styles.tagline}>Reset your password</Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@school.edu"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={handleReset}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}
            {!!notice && <Text style={styles.notice}>{notice}</Text>}

            <Button label="Send reset link" onPress={handleReset} loading={loading} />
          </View>

          <View style={styles.footer}>
            <Link href="/login" asChild>
              <Pressable>
                <Text style={styles.link}>Back to log in</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  tagline: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  form: { marginBottom: spacing.xl },
  error: {
    ...typography.bodySmall,
    color: colors.red,
    marginBottom: spacing.lg,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.green,
    marginBottom: spacing.lg,
  },
  footer: { alignItems: 'center' },
  link: { ...typography.body, color: colors.gold, fontWeight: '600' },
});
