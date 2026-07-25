import { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabaseConfigError } from '@/lib/supabase';
import { consumePendingInviteCode } from '@/lib/invite';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { colors, spacing, typography } from '@/theme';

// Top-level route segments that are reachable while logged OUT.
const PUBLIC_SEGMENTS = ['login', 'signup', 'join', 'forgot-password', 'reset-password'];

// Public segments a signed-in user may still visit: join must work signed-in
// (it's how members join a chapter), and reset-password arrives via a recovery
// deep link that signs the user in before they set the new password.
const SESSION_ALLOWED_SEGMENTS = ['join', 'reset-password'];

function useAuthGate() {
  const { initializing, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Guards overlapping effect runs: without it a re-run while the async
  // consume is in flight gets null and its replace('/') can stomp the
  // replace('/join/…') from the first run.
  const redirecting = useRef(false);

  useEffect(() => {
    if (initializing) return;

    const segment = segments[0] ?? '';
    const inPublicRoute = PUBLIC_SEGMENTS.includes(segment);

    if (!session && !inPublicRoute) {
      // Not authenticated and trying to view a protected screen → login.
      redirecting.current = false;
      router.replace('/login');
    } else if (session && inPublicRoute && !SESSION_ALLOWED_SEGMENTS.includes(segment)) {
      // Authenticated but sitting on an auth screen → resume a pending invite
      // (stored before the email-confirmation round trip) or go home.
      if (redirecting.current) return;
      redirecting.current = true;
      consumePendingInviteCode()
        .then((code) => {
          if (code) {
            router.replace({ pathname: '/join/[code]', params: { code } });
          } else {
            router.replace('/');
          }
        })
        .finally(() => {
          redirecting.current = false;
        });
    }
  }, [initializing, session, segments, router]);
}

function RootNavigator() {
  const { initializing } = useAuth();
  useAuthGate();

  if (initializing) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    />
  );
}

export default function RootLayout() {
  // Readable failure instead of a createClient crash when .env is unfilled.
  if (supabaseConfigError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.configError}>
          <Text style={styles.configErrorTitle}>App not configured</Text>
          <Text style={styles.configErrorBody}>{supabaseConfigError}</Text>
          <Text style={styles.configErrorBody}>
            Copy .env.example to .env and fill in the values, then restart the
            dev server. See docs/SIMULATOR_SETUP.md.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  configError: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  configErrorTitle: { ...typography.h1, color: colors.textPrimary, textAlign: 'center' },
  configErrorBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
