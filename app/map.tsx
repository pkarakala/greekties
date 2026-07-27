import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useMapMembers } from '@/lib/queries';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, spacing, typography } from '@/theme';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

// Lazy require: @rnmapbox/maps is a native module that isn't present in Expo
// Go — a top-level import would throw before any in-component guard runs.
let Mapbox: typeof import('@rnmapbox/maps').default | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Mapbox = require('@rnmapbox/maps').default;
} catch {
  Mapbox = null;
}

export default function MapScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { loading, error, members } = useMapMembers(profile?.chapter_id ?? null);
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    // Guarded so a missing native module / token never crashes startup.
    if (!Mapbox || !MAPBOX_TOKEN || MAPBOX_TOKEN.startsWith('PASTE_')) return;
    try {
      Mapbox.setAccessToken(MAPBOX_TOKEN);
      setTokenReady(true);
    } catch {
      setTokenReady(false);
    }
  }, []);

  // The signed-in user's own pin renders separately (distinct style), so it
  // shows even before the members query includes them — the first user in a
  // chapter still sees themselves on the map.
  const selfLat = profile?.lat ?? null;
  const selfLng = profile?.lng ?? null;
  const selfCoordinate = useMemo<[number, number] | null>(() => {
    if (selfLat == null || selfLng == null) return null;
    return [selfLng, selfLat];
  }, [selfLat, selfLng]);

  const otherMembers = useMemo(
    () => members.filter((m) => m.id !== profile?.id),
    [members, profile?.id],
  );

  const pinCount = otherMembers.length + (selfCoordinate ? 1 : 0);

  // Center on the average of all pin coordinates (members + self).
  const center = useMemo<[number, number]>(() => {
    const coords: [number, number][] = otherMembers.map((m) => [
      m.lng as number,
      m.lat as number,
    ]);
    if (selfCoordinate) coords.push(selfCoordinate);
    if (coords.length === 0) return [-98.5795, 39.8283]; // continental US fallback
    const sum = coords.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]);
    return [sum[0] / coords.length, sum[1] / coords.length];
  }, [otherMembers, selfCoordinate]);

  if (!Mapbox || !MAPBOX_TOKEN || MAPBOX_TOKEN.startsWith('PASTE_') || !tokenReady) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Alumni map" onBack={() => router.back()} />
        <View style={styles.center}>
          <Ionicons name="map-outline" size={44} color={colors.gold} />
          <Text style={styles.fallbackTitle}>Map isn’t available yet</Text>
          <Text style={styles.fallbackBody}>
            The map needs a development build and a Mapbox token — it can’t
            render in Expo Go.
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
          <Mapbox.MapView style={styles.flex} styleURL={Mapbox.StyleURL.Light}>
            <Mapbox.Camera
              zoomLevel={pinCount > 1 ? 3 : 9}
              centerCoordinate={center}
              animationDuration={0}
            />
            {otherMembers.map((m) => (
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
            {selfCoordinate && profile && (
              <Mapbox.PointAnnotation
                key={profile.id}
                id={profile.id}
                coordinate={selfCoordinate}
                onSelected={() =>
                  router.push({ pathname: '/profile/[id]', params: { id: profile.id } })
                }
              >
                <View style={styles.selfPin} />
              </Mapbox.PointAnnotation>
            )}
          </Mapbox.MapView>

          {!!error && <Text style={styles.error}>Couldn’t load pins: {error}</Text>}
          {!error && pinCount === 0 && (
            <Text style={styles.overlayNote}>
              No members have shared a location yet. Add your city in Edit profile to
              put yourself on the map.
            </Text>
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
  // The signed-in user's own pin — slightly larger with a navy border.
  selfPin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
    borderWidth: 3,
    borderColor: colors.navy,
  },
  error: { ...typography.bodySmall, color: colors.red, padding: spacing.lg },
  overlayNote: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
