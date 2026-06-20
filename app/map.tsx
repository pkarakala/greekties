import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';
import { useAuth } from '@/lib/auth';
import { useMapMembers } from '@/lib/queries';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, spacing, typography } from '@/theme';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

export default function MapScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { loading, error, members } = useMapMembers(profile?.chapter_id ?? null);
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    // Guarded so a missing native module / token never crashes startup.
    if (!MAPBOX_TOKEN || MAPBOX_TOKEN.startsWith('PASTE_')) return;
    try {
      Mapbox.setAccessToken(MAPBOX_TOKEN);
      setTokenReady(true);
    } catch {
      setTokenReady(false);
    }
  }, []);

  // Center on the average of member coordinates.
  const center = useMemo<[number, number]>(() => {
    if (members.length === 0) return [-98.5795, 39.8283]; // continental US fallback
    const sum = members.reduce(
      (acc, m) => [acc[0] + (m.lng ?? 0), acc[1] + (m.lat ?? 0)],
      [0, 0],
    );
    return [sum[0] / members.length, sum[1] / members.length];
  }, [members]);

  if (!MAPBOX_TOKEN || MAPBOX_TOKEN.startsWith('PASTE_') || !tokenReady) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Alumni map" onBack={() => router.back()} />
        <View style={styles.center}>
          <Ionicons name="map-outline" size={44} color={colors.gold} />
          <Text style={styles.fallbackTitle}>Map needs a Mapbox token</Text>
          <Text style={styles.fallbackBody}>
            Add EXPO_PUBLIC_MAPBOX_TOKEN to .env and run a custom dev client
            (the map can’t render in Expo Go).
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Alumni map" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <View style={styles.flex}>
          <Mapbox.MapView style={styles.flex} styleURL={Mapbox.StyleURL.Dark}>
            <Mapbox.Camera
              zoomLevel={members.length > 1 ? 3 : 9}
              centerCoordinate={center}
              animationDuration={0}
            />
            {members.map((m) => (
              <Mapbox.PointAnnotation
                key={m.id}
                id={m.id}
                coordinate={[m.lng as number, m.lat as number]}
                onSelected={() =>
                  router.push({ pathname: '/profile/[id]', params: { id: m.id } })
                }
              >
                <View style={styles.pin} />
              </Mapbox.PointAnnotation>
            ))}
          </Mapbox.MapView>

          {!!error && <Text style={styles.error}>Couldn’t load pins: {error}</Text>}
          {!error && members.length === 0 && (
            <Text style={styles.overlayNote}>No members have shared a location yet.</Text>
          )}
        </View>
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
    padding: spacing.xl,
    gap: spacing.md,
  },
  fallbackTitle: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  fallbackBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.background,
  },
  error: { ...typography.bodySmall, color: colors.red, padding: spacing.lg },
  overlayNote: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
