import { useEffect, useRef, type ReactNode } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabaseConfigError } from '@/lib/supabase';
import { readPendingInvite } from '@/lib/invite';
import {
  membershipState,
  canRenderRoute,
  isEntryRoute,
  isApprovedProfileForUser,
} from '@/lib/entry';
import MembershipScreen from './membership';
import { usePushRegistration } from '@/lib/notifications';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { colors, spacing, typography } from '@/theme';

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator color={colors.gold} />
    </View>
  );
}

// Initial resolution is fail-closed. For a previously approved account only,
// hide its subtree during revalidation without unmounting stateful forms/tabs.
export function ScreenAccess({ name, children }: { name: string; children: ReactNode }) {
  const auth = useAuth();
  const state = membershipState(
    auth.initializing,
    !!auth.session,
    auth.profileState,
    auth.profile,
    auth.authError,
  );
  if (auth.initializing && !isEntryRoute(name)) return <Splash />;
  if (
    state === 'approved' &&
    !isEntryRoute(name) &&
    !isApprovedProfileForUser(auth.profile, auth.session?.user.id)
  )
    return <Splash />;
  const retaining =
    !auth.authError &&
    isApprovedProfileForUser(auth.profile, auth.session?.user.id) &&
    (state === 'loading' || state === 'error');
  if (
    !isEntryRoute(name) &&
    canRenderRoute(name, 'approved') &&
    (state === 'approved' || retaining)
  ) {
    return (
      <View style={{ flex: 1 }}>
        <View
          key={`${auth.session?.user.id}:${auth.profile?.id}:${auth.profile?.chapter_id}`}
          style={{ flex: 1, display: retaining ? 'none' : 'flex' }}
          pointerEvents={retaining ? 'none' : 'auto'}
          accessibilityElementsHidden={retaining}
          importantForAccessibility={retaining ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </View>
        {retaining && <MembershipScreen />}
      </View>
    );
  }
  if (canRenderRoute(name, state)) return <>{children}</>;
  if (state === 'signed-out') return <Splash />;
  return <MembershipScreen />;
}

function RootNavigator() {
  const auth = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const resumedUser = useRef<string | null>(null);
  const route = segments.join('/');
  const state = membershipState(
    auth.initializing,
    !!auth.session,
    auth.profileState,
    auth.profile,
    auth.authError,
  );
  usePushRegistration();

  useEffect(() => {
    // A failed revalidation stays in place behind the recovery screen so
    // navigating away cannot destroy the hidden draft before a retry.
    if (
      auth.initializing ||
      state === 'loading' ||
      (state === 'error' &&
        !auth.authError &&
        isApprovedProfileForUser(auth.profile, auth.session?.user.id))
    )
      return;
    let active = true;
    const userId = auth.session?.user.id;
    if (!userId) resumedUser.current = null;
    if (isEntryRoute(route)) return;
    if (state === 'signed-out') {
      if (route !== 'login' && route !== 'signup') router.replace('/login');
      return;
    }
    if (state === 'error') {
      router.replace('/membership');
      return;
    }
    void (async () => {
      // Read, never consume. Cancellation makes delayed reads harmless after
      // sign-out, a new deep link, or a password-recovery navigation.
      if (userId && resumedUser.current !== userId) {
        const { invite } = await readPendingInvite();
        if (!active) return;
        resumedUser.current = userId;
        if (invite) {
          router.replace({ pathname: '/join/[code]', params: { code: invite.code } });
          return;
        }
      }
      if (!active) return;
      if (state !== 'approved' && route !== 'onboarding/create-chapter')
        router.replace('/membership');
      else if (route === 'login' || route === 'signup') router.replace('/');
    })();
    return () => {
      active = false;
    };
  }, [
    auth.initializing,
    auth.session?.user.id,
    auth.authError,
    auth.profile,
    state,
    route,
    router,
  ]);

  return (
    <Stack
      screenLayout={({ route: screen, children }) => (
        <ScreenAccess name={screen.name}>{children}</ScreenAccess>
      )}
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
            Copy .env.example to .env and fill in the values, then restart the dev server. See
            docs/SIMULATOR_SETUP.md.
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
