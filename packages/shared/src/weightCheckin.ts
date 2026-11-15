import { shiftISODate } from './dateUtils.js'

export const DEFAULT_WEIGHT_CHECKIN_DAYS = 7
export const MIN_WEIGHT_CHECKIN_DAYS = 3
export const MAX_WEIGHT_CHECKIN_DAYS = 30

/** Choices offered in settings. Weekly is the default: daily readings mostly show water. */
export const WEIGHT_CHECKIN_OPTIONS: readonly { days: number; label: string }[] = [
  { days: 3, label: 'Every 3 days' },
  { days: 7, label: 'Weekly (recommended)' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Monthly' },
]

export function clampCheckinDays(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return DEFAULT_WEIGHT_CHECKIN_DAYS
  return Math.min(MAX_WEIGHT_CHECKIN_DAYS, Math.max(MIN_WEIGHT_CHECKIN_DAYS, Math.round(n)))
}

export type WeightCheckinReason =
  | 'disabled'
  | 'never_logged'
  | 'interval_elapsed'
  | 'snoozed'
  | 'not_due'

export interface WeightCheckinInput {
  tracking: boolean
  intervalDays: number
  snoozedUntil: string | null
  lastMeasuredOn: string | null
  /** Today in the user's time zone (YYYY-MM-DD). */
  today: string
}

export interface WeightCheckinStatus {
  due: boolean
  reason: WeightCheckinReason
  intervalDays: number
  lastMeasuredOn: string | null
  nextDueOn: string | null
  daysSinceLast: number | null
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`)
  const to = Date.parse(`${toIso}T00:00:00Z`)
  return Math.round((to - from) / 86_400_000)
}

export function getWeightCheckinStatus(input: WeightCheckinInput): WeightCheckinStatus {
  const intervalDays = clampCheckinDays(input.intervalDays)
  const daysSinceLast = input.lastMeasuredOn ? daysBetween(input.lastMeasuredOn, input.today) : null
  const nextDueOn = input.lastMeasuredOn ? shiftISODate(input.lastMeasuredOn, intervalDays) : null
  const base = { intervalDays, lastMeasuredOn: input.lastMeasuredOn, nextDueOn, daysSinceLast }

  if (!input.tracking) return { ...base, due: false, reason: 'disabled' }
  if (input.snoozedUntil && input.today <= input.snoozedUntil) {
    return { ...base, due: false, reason: 'snoozed' }
  }
  if (!input.lastMeasuredOn) return { ...base, due: true, reason: 'never_logged' }
  if (nextDueOn !== null && input.today >= nextDueOn) {
    return { ...base, due: true, reason: 'interval_elapsed' }
  }
  return { ...base, due: false, reason: 'not_due' }
}

export interface WeightPoint {
  measuredOn: string
  weightKg: number
}

export interface WeightTrend {
  latestKg: number | null
  latestOn: string | null
  /** Exponentially smoothed weight: less noisy than the last reading. */
  trendKg: number | null
  /** Change in the smoothed trend over the window, kg (negative = loss). */
  changeKg: number | null
  windowDays: number
  points: number
}

/** Smoothed weight trend (EMA, alpha 0.25) over the last `windowDays`. */
export function summarizeWeightTrend(
  points: readonly WeightPoint[],
  windowDays = 30,
  alpha = 0.25,
): WeightTrend {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.weightKg))
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
  if (sorted.length === 0) {
    return { latestKg: null, latestOn: null, trendKg: null, changeKg: null, windowDays, points: 0 }
  }
  const latest = sorted[sorted.length - 1]!
  const cutoff = shiftISODate(latest.measuredOn, -windowDays)
  const recent = sorted.filter((p) => p.measuredOn >= cutoff)
  let ema = recent[0]!.weightKg
  const first = ema
  for (const p of recent.slice(1)) ema = alpha * p.weightKg + (1 - alpha) * ema
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    latestKg: round(latest.weightKg),
    latestOn: latest.measuredOn,
    trendKg: round(ema),
    changeKg: recent.length > 1 ? round(ema - first) : null,
    windowDays,
    points: recent.length,
  }
}
