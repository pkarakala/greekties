export const colors = {
  // Backgrounds (warm cream, layered light)
  background: '#F6F1E7', // app background — warm cream
  surface: '#FFFCF5', // cards sit on this
  surfaceElevated: '#FFFFFF', // elevated cards, modals
  surfaceHover: '#EDE5D4', // pressed/active card state

  // Antique gold accent. Contrast measurements are in docs/SLICE_4_IMPLEMENTATION.md.
  gold: '#795815', // accent text and icons; primary actions use navy
  goldHover: '#684A10', // pressed gold
  goldSoft: 'rgba(160,118,30,0.12)', // gold tint backgrounds

  // Text (navy family)
  textPrimary: '#16294A', // headlines, main text — brand navy
  textSecondary: '#4E5E77', // subtitles, metadata
  textTertiary: '#566579', // hints, timestamps

  // Accents (darkened for contrast on light surfaces)
  green: '#236B43', // positive stats ("+12 this month"), online status
  red: '#AC3035', // errors, destructive actions
  blue: '#245EB9', // links, info

  // Borders
  border: 'rgba(22,41,74,0.12)', // subtle card borders
  borderStrong: '#7B827F', // essential control boundaries

  // Brand primitives
  navy: '#16294A',
  cream: '#F6F1E7',
} as const;

export type Colors = typeof colors;
