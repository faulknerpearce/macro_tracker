export type ZoneId = 'dashboard' | 'inputs' | 'outputs' | 'profile'

/**
 * Zone accents (canonical palette):
 * - Dashboard blue: #0C4197
 * - Inputs green:   #008957
 * - Outputs yellow: #E89830
 */
/** Input / fuel — green. */
export const ZONE_INPUT = '#008957'
export const ZONE_INPUT_DEEP = '#006B44'

/** Output / burn — golden yellow. */
export const ZONE_OUTPUT = '#E89830'
export const ZONE_OUTPUT_DEEP = '#B87620'

/**
 * Historical aliases — prefer ZONE_INPUT / ZONE_OUTPUT in new code.
 * ZONE_GREEN was input accent; ZONE_CORAL was output accent.
 */
export const ZONE_GREEN = ZONE_INPUT
export const ZONE_GREEN_DEEP = ZONE_INPUT_DEEP
export const ZONE_CORAL = ZONE_OUTPUT
export const ZONE_CORAL_DEEP = ZONE_OUTPUT_DEEP

export const ZONE_BLUE = '#0C4197'

/** Darker companions for eyebrows / strong labels (same hue family). */
export const ZONE_BLUE_DEEP = '#093070'

/** Sunset warm accent — residual brand (charts, accents). */
export const BRAND_SUNSET = '#FF6B35'

/** Dashboard blue — same chroma family as ZONE_BLUE. */
export const DASHBOARD_SKY_TOP = ZONE_BLUE

/** @deprecated Use BRAND_SUNSET — kept as alias for any remaining imports. */
export const BRAND_BLUE = BRAND_SUNSET

/**
 * Brand neutrals.
 * Dark: #070808 · Light: #EBF0ED
 * Mid steps are mixes for secondary text and chrome.
 */
export const NEUTRAL_DARK = '#070808'
export const NEUTRAL_LIGHT = '#EBF0ED'

export const neutrals = {
  textPrimary: NEUTRAL_DARK,
  textSecondary: '#2C2E2D',
  textMuted: '#5A5E5C',
  textSubtle: '#5A5E5C',
  textFaint: '#8A8E8C',
  border: 'rgba(7, 8, 8, 0.08)',
  borderStrong: 'rgba(7, 8, 8, 0.12)',
  /** Elevated shells (collapsible panels, modals) — white. */
  surface: '#FFFFFF',
  /**
   * Filled content boxes (meal/activity log rows) — brand light neutral.
   * Must differ from pageBg so boxes read as #EBF0ED tiles.
   */
  surfaceMuted: NEUTRAL_LIGHT,
  surfaceHover: '#E2E8E4',
  /** Page canvas — white so light-neutral boxes are visible. */
  pageBg: '#FFFFFF',
} as const

/** Semantic status (alerts) — slightly softened for wellness feel. */
export const status = {
  danger: {
    text: '#FF453A',
    textStrong: '#D70015',
    bg: '#FFF1F0',
    border: '#FFC9C5',
  },
  success: {
    text: '#34C759',
    textStrong: '#248A3D',
    bg: '#EAF9EE',
    border: '#B6EBC5',
  },
  warning: {
    text: '#FF9F0A',
    textStrong: '#C93400',
    bg: '#FFF6E5',
    border: '#FFE0A3',
  },
  info: {
    text: '#5AC8FA',
    textStrong: '#007AFF',
    bg: '#EAF6FF',
    border: '#B8E0FA',
  },
} as const

/**
 * Radius scale (px).
 * Elevated cards use `xxl` (28) — reference style.
 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 9999,
} as const

/** Shadow scale (tinted from NEUTRAL_DARK). */
export const shadow = {
  none: 'none',
  soft: '0 4px 16px rgba(7, 8, 8, 0.06)',
  elevated: '0 14px 36px rgba(7, 8, 8, 0.10)',
  modal: '0 25px 50px -12px rgba(7, 8, 8, 0.28)',
} as const

export const type = {
  eyebrow: 11,
  caption: 12,
  bodySm: 13,
  body: 14,
  titleSm: 20,
  titleMd: 22,
  titleLg: 28,
  titleXl: 32,
  display: 36,
  hero: 52,
} as const

/** Atmosphere: grain + gradient status bars. */
export const atmosphere = {
  grainOpacity: 0.07,
  accentDots: ['#FF6B35', '#FF8C5A', '#B07B9E'] as const,
  gradients: {
    warmCool: 'linear-gradient(90deg, #FF6B35, #5AC8FA)',
    dangerCool: 'linear-gradient(90deg, #FF453A, #64D2FF)',
    goldenSky: 'linear-gradient(90deg, #FFD700, #64D2FF)',
    peach: 'linear-gradient(90deg, #FF9F5C, #FFDB85)',
    cool: 'linear-gradient(90deg, #5AC8FA, #007AFF)',
  },
} as const

/**
 * Calm design system tokens, as CSS variables defined in index.css :root
 * (source: docs/design-system/calm.html). Use these instead of hex values.
 */
export const calm = {
  text: 'var(--mt-text)',
  textSecondary: 'var(--mt-text-secondary)',
  quiet: 'var(--mt-quiet)',
  line: 'var(--mt-line)',
  bg: 'var(--mt-bg)',
  panel: 'var(--mt-panel)',
  data: 'var(--mt-data)',
  dataMuted: 'var(--mt-data-muted)',
  dataLight: 'var(--mt-data-light)',
  dataFaint: 'var(--mt-data-faint)',
  accent: 'var(--mt-accent)',
  over: 'var(--mt-over)',
  overText: 'var(--mt-over-text)',
} as const

/**
 * Zone backgrounds. Calm uses one flat screen background everywhere, so every
 * zone gets the same value (kept per zone so callers don't change).
 */
export const zoneGradients: Record<ZoneId, string> = {
  dashboard: calm.bg,
  inputs: calm.bg,
  outputs: calm.bg,
  profile: calm.bg,
}

/**
 * Page chrome on light atmospheres — dark readable text (no white-on-sky).
 * CSS vars keep the historic `--zone-on-sky*` names for compatibility.
 */
export const onSky = {
  text: neutrals.textPrimary,
  textMuted: neutrals.textMuted,
  textFaint: neutrals.textFaint,
  shadow: 'none',
  shadowStrong: 'none',
} as const

/** Frosted glass surfaces for layered chrome (nav, docks, menus). */
export const glass = {
  bg: 'rgba(255, 255, 255, 0.72)',
  bgStrong: 'rgba(255, 255, 255, 0.82)',
  bgSoft: 'rgba(255, 255, 255, 0.62)',
  border: 'rgba(7, 8, 8, 0.08)',
  borderEdge: 'rgba(7, 8, 8, 0.08)',
  blur: '16px',
  shadow: '0 8px 28px rgba(7, 8, 8, 0.08)',
  shadowSoft: '0 4px 16px rgba(7, 8, 8, 0.06)',
} as const

export interface ZoneTokens {
  id: ZoneId
  accent: string
  accentMuted: string
  accentText: string
  /** Full CSS background (gradient) for page atmosphere. */
  bg: string
  cardBg: string
  cardBorder: string
  /** Eyebrow color inside white cards / chrome that sits on white. */
  eyebrow: string
  /** Page-level labels on the sky gradient. */
  onSky: string
  onSkyMuted: string
}

/**
 * Calm zone tokens: amber is only ever a fill with dark text (buttons, active
 * tabs, selected states); labels, borders and backgrounds are neutral. Zones
 * share one look; ZoneId stays so routing and layout code don't change.
 */
function calmZone(id: ZoneId): ZoneTokens {
  return {
    id,
    accent: calm.accent,
    accentMuted: calm.line,
    accentText: calm.text,
    bg: zoneGradients[id],
    cardBg: calm.panel,
    cardBorder: calm.line,
    eyebrow: calm.textSecondary,
    onSky: calm.text,
    onSkyMuted: calm.textSecondary,
  }
}

export const zoneTokens: Record<ZoneId, ZoneTokens> = {
  dashboard: calmZone('dashboard'),
  inputs: calmZone('inputs'),
  outputs: calmZone('outputs'),
  profile: calmZone('profile'),
}

export function zoneCssVars(zone: ZoneTokens): Record<string, string> {
  return {
    '--zone-accent': zone.accent,
    '--zone-accent-muted': zone.accentMuted,
    '--zone-accent-text': zone.accentText,
    '--zone-bg': zone.bg,
    '--zone-card-bg': zone.cardBg,
    '--zone-card-border': zone.cardBorder,
    '--zone-eyebrow': zone.eyebrow,
    '--zone-on-sky': zone.onSky,
    '--zone-on-sky-muted': zone.onSkyMuted,
    '--zone-on-sky-shadow': onSky.shadow,
    '--zone-on-sky-shadow-strong': onSky.shadowStrong,
  }
}

export function globalCssVars(): Record<string, string> {
  return {
    '--color-text-primary': neutrals.textPrimary,
    '--color-text-secondary': neutrals.textSecondary,
    '--color-text-muted': neutrals.textMuted,
    '--color-text-subtle': neutrals.textSubtle,
    '--color-text-faint': neutrals.textFaint,
    '--color-border': neutrals.border,
    '--color-border-strong': neutrals.borderStrong,
    '--color-surface': neutrals.surface,
    '--color-surface-muted': neutrals.surfaceMuted,
    '--color-surface-hover': neutrals.surfaceHover,
    '--color-page-bg': neutrals.pageBg,
    '--color-danger': status.danger.text,
    '--color-danger-strong': status.danger.textStrong,
    '--color-danger-bg': status.danger.bg,
    '--color-danger-border': status.danger.border,
    '--color-success': status.success.text,
    '--color-success-strong': status.success.textStrong,
    '--color-success-bg': status.success.bg,
    '--color-success-border': status.success.border,
    '--color-warning': status.warning.text,
    '--color-warning-strong': status.warning.textStrong,
    '--color-warning-bg': status.warning.bg,
    '--color-warning-border': status.warning.border,
    '--color-info': status.info.text,
    '--color-info-strong': status.info.textStrong,
    '--color-info-bg': status.info.bg,
    '--color-info-border': status.info.border,
    '--radius-sm': `${radius.sm}px`,
    '--radius-md': `${radius.md}px`,
    '--radius-lg': `${radius.lg}px`,
    '--radius-xl': `${radius.xl}px`,
    '--radius-xxl': `${radius.xxl}px`,
    '--radius-pill': `${radius.pill}px`,
    '--shadow-soft': shadow.soft,
    '--shadow-elevated': shadow.elevated,
    '--shadow-modal': shadow.modal,
    '--brand-sunset': BRAND_SUNSET,
    '--nav-center-blue': BRAND_SUNSET,
  }
}
