import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Wordmark } from '@/components/Wordmark';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/account';

// Reached via the recovery deep link (greekties://reset-password), which signs
// the user in first — the auth gate allows this segment with a session.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { initializing, session, authError } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpdate() {
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Wordmark tone="home" size={36} />
            <Text style={styles.tagline}>Choose a new password</Text>
          </View>

          <View style={styles.form}>
            <TextField
              tone="home"
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
            />
            <TextField
              tone="home"
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repeat your new password"
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleUpdate}
            />

            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}

            {!!authError && (
              <Text accessibilityRole="alert" style={styles.error}>
                {authError}
              </Text>
            )}
            {!initializing && !session && (
              <Text accessibilityRole="alert" style={styles.error}>
                Open the reset link from your email to choose a new password.
              </Text>
            )}
            <Button
              tone="home"
              label="Update password"
              onPress={handleUpdate}
              loading={loading || initializing}
              disabled={!session || !!authError}
            />
            <Button
              tone="home"
              label="Request a new reset link"
              variant="secondary"
              onPress={() => router.replace('/forgot-password')}
            />
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
    paddingHorizontal: 20,
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
});
