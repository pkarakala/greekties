import type { TextStyle } from 'react-native';

// `as const` keeps fontWeight as a literal type compatible with React Native's TextStyle.
export const typography = {
  // Hero number — the "network net worth"
  hero: { fontSize: 44, fontWeight: '700', letterSpacing: -1 },
  heroLabel: { fontSize: 14, fontWeight: '500' }, // label above/below hero

  // Headings
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '600' },
  h3: { fontSize: 17, fontWeight: '600' },

  // Body
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500' }, // timestamps, metadata
} as const satisfies Record<string, TextStyle>;

export type Typography = typeof typography;
