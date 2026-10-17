import { homeColors, homeTypography } from './home';

// Slice E only: existing global and completed slice tokens remain unchanged.
export const colors = {
  ...homeColors,
  textPrimary: homeColors.navy,
  textSecondary: homeColors.muted,
  textTertiary: homeColors.muted,
  borderStrong: '#7F8CA1',
  goldSoft: homeColors.goldLight,
  surfaceHover: homeColors.goldLight,
  surfaceElevated: homeColors.surface,
  red: homeColors.error,
  green: '#1B6B4A',
} as const;
export const typography = {
  h1: homeTypography.page,
  h2: homeTypography.section,
  h3: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 23 },
  bodySmall: { fontSize: 15, lineHeight: 23 },
  caption: { fontSize: 12, lineHeight: 18 },
  heroLabel: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
} as const;
