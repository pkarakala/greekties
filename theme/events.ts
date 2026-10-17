import type { TextStyle } from 'react-native';

import { colors } from './colors';

// Events uses the existing cream/navy/gold brand theme.
export const eventColors = {
  canvas: colors.background,
  surface: colors.surface,
  text: colors.textPrimary,
  muted: colors.textSecondary,
  action: colors.navy,
  onAction: colors.cream,
  accent: colors.gold,
  soft: colors.surfaceHover,
  divider: colors.border,
  control: colors.borderStrong,
  error: colors.red,
  errorSurface: colors.surfaceElevated,
} as const;

export const eventTypography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  section: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24 },
  support: { fontSize: 15, lineHeight: 21 },
  meta: { fontSize: 13, lineHeight: 18 },
} as const satisfies Record<string, TextStyle>;
