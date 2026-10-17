import type { TextStyle } from 'react-native';
import { homeColors, homeTypography } from './home';

// Slice B only. Legacy event tokens are also used by People and Jobs.
export const eventColors = {
  canvas: homeColors.background,
  surface: homeColors.surface,
  text: homeColors.navy,
  muted: homeColors.muted,
  action: homeColors.blue,
  onAction: homeColors.surface,
  accent: homeColors.gold,
  soft: homeColors.goldLight,
  divider: homeColors.border,
  control: '#7F8CA1',
  error: homeColors.error,
  errorSurface: '#FFF3F4',
} as const;
export const eventTypography = {
  title: homeTypography.page,
  section: homeTypography.section,
  body: { fontSize: 15, lineHeight: 23 },
  support: { fontSize: 15, lineHeight: 23 },
  meta: { fontSize: 12, lineHeight: 18 },
} as const satisfies Record<string, TextStyle>;
