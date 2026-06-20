// 4px base unit
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16, // cards
  xl: 20,
  full: 999, // pill-shaped buttons
} as const;

export type Spacing = typeof spacing;
export type Radius = typeof radius;
