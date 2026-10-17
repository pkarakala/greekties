import { homeColors, homeTypography } from './home';

// Slice C only; existing global theme and Home/Events tokens stay unchanged.
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
  h3: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 23 },
  bodySmall: { fontSize: 15, lineHeight: 23 },
  caption: { fontSize: 12, lineHeight: 18 },
} as const;
