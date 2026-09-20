import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { colors, typography } from '@/theme';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<Size, number> = { xs: 28, sm: 40, md: 56, lg: 88 };

interface AvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: Size;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

export function Avatar({ uri, name, size = 'md' }: AvatarProps) {
  const { fontScale } = useWindowDimensions();
  const dim = SIZES[size];
  const fallbackDim = dim * Math.max(1, fontScale);
  const dimStyle = { width: dim, height: dim, borderRadius: dim / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimStyle]} contentFit="cover" />;
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: fallbackDim, height: fallbackDim, borderRadius: fallbackDim / 2 },
      ]}
    >
      <Text style={[styles.initials, { fontSize: dim * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceElevated },
  fallback: {
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: colors.gold, fontWeight: typography.h3.fontWeight },
});
