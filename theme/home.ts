import { Platform, type TextStyle } from 'react-native';

// Slice A only: do not recolor unreviewed screens through the global theme.
export const homeColors = {
  blue: '#123FA0',
  navy: '#142743',
  gold: '#E9BD52',
  goldLight: '#FCF2D6',
  surface: '#FFFFFF',
  background: '#F6F8FC',
  muted: '#526176',
  border: '#D8DEE8',
  error: '#A12332',
} as const;
export const homeSerif = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, serif',
});
export const homeTypography = {
  page: {
    fontFamily: homeSerif,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '400',
    letterSpacing: 0,
  },
  section: {
    fontFamily: homeSerif,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400',
    letterSpacing: 0,
  },
} as const satisfies Record<string, TextStyle>;
