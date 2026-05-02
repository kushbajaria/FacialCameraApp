/**
 * Design system — colors, spacing, typography, and shadows.
 *
 * Palette is a refined dark theme inspired by professional security/smart-home
 * apps (Ring, SimpliSafe). Warm neutrals replace pure black; accent blue is
 * calm and confident rather than neon.
 */

export const Colors = {
  // Backgrounds — layered dark surfaces with warm undertone
  bg:          '#0C0F14',
  surface:     '#151921',
  surfaceHigh: '#1C2230',
  elevated:    '#232A3A',

  // Borders — very subtle, used sparingly
  border:      '#1E2436',
  borderHigh:  '#2A3348',

  // Accent — confident blue that reads well in dark mode
  accent:      '#3B82F6',
  accentSoft:  'rgba(59,130,246,0.15)',
  accentMid:   'rgba(59,130,246,0.35)',

  // Semantic
  green:       '#34D399',
  greenSoft:   'rgba(52,211,153,0.12)',
  red:         '#F87171',
  redSoft:     'rgba(248,113,113,0.12)',
  amber:       '#FBBF24',
  amberSoft:   'rgba(251,191,36,0.12)',

  // Text — high contrast primary, muted secondary
  text:        '#F1F5F9',
  textSecondary: '#94A3B8',
  textTertiary:  '#475569',
  textInverse: '#0C0F14',
};

export const Spacing = {
  xxs: 2,
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  xs:   6,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  full: 9999,
};

export const Typography = {
  largeTitle: {
    fontSize: 30,
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    color: Colors.text,
    lineHeight: 22,
  },
  callout: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400' as const,
    color: Colors.textSecondary,
  },
  caption: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: Colors.textTertiary,
    letterSpacing: 0.3,
  },
  overline: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.textTertiary,
    letterSpacing: 1.0,
    textTransform: 'uppercase' as const,
  },
};

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  cardSubtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  button: {
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
};
