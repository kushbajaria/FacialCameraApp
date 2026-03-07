// ─────────────────────────────────────────────────────────────────────────────
// THEME — colors, spacing, typography
// ─────────────────────────────────────────────────────────────────────────────

export const Colors = {
  // Backgrounds
  bg:          '#0A0C10',
  surface:     '#12151C',
  surfaceHigh: '#1A1F2B',

  // Borders
  border:      '#1F2535',
  borderHigh:  '#2A3348',

  // Accent
  accent:      '#00D4FF',
  accentDim:   'rgba(0,212,255,0.12)',

  // Semantic
  green:       '#4ADE80',
  greenDim:    'rgba(74,222,128,0.12)',
  red:         '#FF4D6D',
  redDim:      'rgba(255,77,109,0.12)',
  amber:       '#FBBF24',
  amberDim:    'rgba(251,191,36,0.12)',

  // Text
  text:        '#E8EDF5',
  textMid:     '#8892A4',
  textDim:     '#4A5568',
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
};

export const Radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  full: 9999,
};

export const Typography = {
  screenTitle:  { fontSize: 28, fontWeight: '700' as const, color: Colors.text, letterSpacing: -0.5 },
  sectionLabel: { fontSize: 11, fontWeight: '700' as const, color: Colors.textDim, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  body:         { fontSize: 14, fontWeight: '400' as const, color: Colors.text },
  bodyBold:     { fontSize: 14, fontWeight: '700' as const, color: Colors.text },
  caption:      { fontSize: 11, fontWeight: '400' as const, color: Colors.textDim },
  badge:        { fontSize: 9,  fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};
