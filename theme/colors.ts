export const colors = {
  // Backgrounds (near-black, layered)
  background: '#0A0A0B', // app background — almost pure black
  surface: '#141416', // cards sit on this
  surfaceElevated: '#1C1C1F', // elevated cards, modals
  surfaceHover: '#242428', // pressed/active card state

  // Brand gold
  gold: '#C8A24A', // primary brand — buttons, highlights, hero accents
  goldHover: '#B8923A', // pressed gold
  goldSoft: 'rgba(200,162,74,0.12)', // gold tint backgrounds

  // Text
  textPrimary: '#F5F4F0', // headlines, main text (warm white, not pure white)
  textSecondary: '#A0A0A5', // subtitles, metadata
  textTertiary: '#6B6B70', // hints, timestamps

  // Accents
  green: '#4ADE80', // positive stats ("+12 this month"), online status
  red: '#F87171', // errors, destructive actions
  blue: '#60A5FA', // links, info

  // Borders
  border: 'rgba(255,255,255,0.08)', // subtle card borders
  borderStrong: 'rgba(255,255,255,0.14)', // emphasized borders
} as const;

export type Colors = typeof colors;
