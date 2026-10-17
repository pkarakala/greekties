import { homeColors, homeTypography } from './home';

// Opt-in Slice D palette. Legacy consumers keep their existing theme.
export const colors = {
  ...homeColors,
  textPrimary: homeColors.navy,
  textSecondary: homeColors.muted,
  textTertiary: homeColors.muted,
  borderStrong: '#7F8CA1',
  goldSoft: homeColors.goldLight,
  surfaceHover: homeColors.goldLight,
  red: homeColors.error,
} as const;
export const typography = {
  h1: homeTypography.page,
  h3: homeTypography.section,
  body: { fontSize: 15, lineHeight: 23 },
  bodySmall: { fontSize: 15, lineHeight: 23 },
  caption: { fontSize: 12, lineHeight: 18 },
} as const;
