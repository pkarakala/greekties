import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { colors } from '@/theme';

// Top-level route segments that are reachable while logged OUT.
const PUBLIC_SEGMENTS = ['login', 'signup', 'join'];

function useAuthGate() {
  const { initializing, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;

    const inPublicRoute = PUBLIC_SEGMENTS.includes(segments[0] ?? '');

    if (!session && !inPublicRoute) {
      // Not authenticated and trying to view a protected screen → login.
      router.replace('/login');
    } else if (session && inPublicRoute) {
      // Authenticated but sitting on an auth screen → home.
      router.replace('/');
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
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
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
});
