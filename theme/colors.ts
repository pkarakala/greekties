export const colors = {
  // Backgrounds (warm cream, layered light)
  background: '#F6F1E7', // app background — warm cream
  surface: '#FFFCF5', // cards sit on this
  surfaceElevated: '#FFFFFF', // elevated cards, modals
  surfaceHover: '#EDE5D4', // pressed/active card state

  // Brand gold (deepened antique gold — legible on cream)
  gold: '#A0761E', // primary brand — buttons, highlights, hero accents
  goldHover: '#8A6519', // pressed gold
  goldSoft: 'rgba(160,118,30,0.12)', // gold tint backgrounds

  // Text (navy family)
  textPrimary: '#16294A', // headlines, main text — brand navy
  textSecondary: '#4E5E77', // subtitles, metadata
  textTertiary: '#8291A6', // hints, timestamps

  // Accents (darkened for contrast on light surfaces)
  green: '#1F8A4C', // positive stats ("+12 this month"), online status
  red: '#C03D3D', // errors, destructive actions
  blue: '#2E6ED9', // links, info

  // Borders
  border: 'rgba(22,41,74,0.12)', // subtle card borders
  borderStrong: 'rgba(22,41,74,0.22)', // emphasized borders

  // Brand primitives
  navy: '#16294A',
  cream: '#F6F1E7',
} as const;

export type Colors = typeof colors;
