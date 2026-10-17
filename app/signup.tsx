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
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { storePendingInviteCode } from '@/lib/invite';
import { TERMS_URL, PRIVACY_URL } from '@/lib/legal';
import { openExternalUrl } from '@/lib/url';
import { Wordmark } from '@/components/Wordmark';
import { InvitationContext } from '@/components/InvitationContext';
import { parseInviteCode } from '@/lib/links';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/account';

export default function SignupScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setError(null);
    setNotice(null);

    if (!name.trim() || !email.trim() || !password) {
      setError('Fill in your name, email, and a password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const normalized = parseInviteCode(code);
    if (normalized) await storePendingInviteCode(normalized);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // Email confirmation enabled → no session until the user confirms. Keep
    // the invite code so the join flow resumes after they confirm + log in.
    if (!data.session) {
      setNotice(
        'Check your email to confirm your account, then return here and log in. Keep your original invitation link if you switch devices or install the app.',
      );
      return;
    }

    // The root gate alone resumes the invitation after the profile check.
  }

  const loginHref: Href = code ? { pathname: '/login', params: { code } } : '/login';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Wordmark tone="home" size={36} />
            <Text style={styles.tagline}>Create your account</Text>
          </View>

          <View style={styles.form}>
            <InvitationContext code={code} />
            <TextField
              tone="home"
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="Jordan Avery"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
            />
            <TextField
              tone="home"
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@school.edu"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextField
              tone="home"
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSignup}
            />

            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            {!!notice && (
              <Text accessibilityLiveRegion="polite" style={styles.notice}>
                {notice}
              </Text>
            )}

            <Button tone="home" label="Sign up" onPress={handleSignup} loading={loading} />

            <Text style={styles.terms}>
              By signing up you agree to our Terms and Privacy Policy.
            </Text>
            <View style={styles.legalLinks}>
              <Pressable
                accessibilityRole="link"
                style={styles.linkControl}
                onPress={() => openExternalUrl(TERMS_URL)}
              >
                <Text style={styles.termsLink}>Terms</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                style={styles.linkControl}
                onPress={() => openExternalUrl(PRIVACY_URL)}
              >
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href={loginHref} asChild>
              <Pressable style={styles.linkControl}>
                <Text style={styles.link}>Log in</Text>
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
  notice: {
    ...typography.bodySmall,
    color: colors.green,
    marginBottom: spacing.lg,
  },
  footer: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: { ...typography.body, color: colors.textSecondary },
  linkControl: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  link: { ...typography.body, color: colors.blue, fontWeight: '600' },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  terms: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  termsLink: { color: colors.blue, fontWeight: '600' },
});
