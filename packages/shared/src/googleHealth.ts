/**
 * Google Health API (successor to the Fitbit Web API; Google Fit REST ends in 2026).
 * Pure helpers only — request shapes and response mapping. Network calls live in the
 * server package so this file stays usable in tests and the browser.
 *
 * Reference: https://developers.google.com/health
 */
import { listDatesInRange, shiftISODate } from './dateUtils.js'

export const GOOGLE_HEALTH_API_BASE = 'https://health.googleapis.com/v4'
export const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

/** Read-only: steps, calories and workouts; weight. These are Restricted scopes (Google review). */
export const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
] as const

/** dailyRollUp accepts at most 14 days per request. */
export const GOOGLE_HEALTH_MAX_ROLLUP_DAYS = 14

export interface FitnessSyncSettings {
  importWorkouts: boolean
  /** Use the tracker's total calories as the day's base burn (replaces BMR). */
  importCalories: boolean
  importSteps: boolean
  importWeight: boolean
}

export const DEFAULT_FITNESS_SYNC_SETTINGS: FitnessSyncSettings = {
  importWorkouts: true,
  importCalories: true,
  importSteps: true,
  importWeight: true,
}

export function parseFitnessSyncSettings(raw: unknown): FitnessSyncSettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const pick = (snake: string, camel: keyof FitnessSyncSettings) => {
    const v = r[snake] ?? r[camel]
    return typeof v === 'boolean' ? v : DEFAULT_FITNESS_SYNC_SETTINGS[camel]
  }
  return {
    importWorkouts: pick('import_workouts', 'importWorkouts'),
    importCalories: pick('import_calories', 'importCalories'),
    importSteps: pick('import_steps', 'importSteps'),
    importWeight: pick('import_weight', 'importWeight'),
  }
}

export function serializeFitnessSyncSettings(s: FitnessSyncSettings): Record<string, boolean> {
  return {
    import_workouts: s.importWorkouts,
    import_calories: s.importCalories,
    import_steps: s.importSteps,
    import_weight: s.importWeight,
  }
}

export function buildGoogleAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: GOOGLE_HEALTH_SCOPES.join(' '),
    access_type: 'offline',
    // Always ask, so Google returns a refresh token even on reconnect.
    prompt: 'consent',
    state: opts.state,
  })
  // Note: include_granted_scopes is deliberately omitted (legacy fitness.* scopes can 403).
  return `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface CivilDateTime {
  date: { year: number; month: number; day: number }
  time: { hours: number; minutes: number; seconds: number; nanos: number }
}

export function civilMidnight(iso: string): CivilDateTime {
  const [y, m, d] = iso.split('-').map((p) => Number.parseInt(p, 10))
  return { date: { year: y!, month: m!, day: d! }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } }
}

/** Body for POST .../dataTypes/{type}/dataPoints:dailyRollUp over [startIso, endIso] inclusive. */
export function dailyRollUpBody(startIso: string, endIsoInclusive: string) {
  return {
    range: { start: civilMidnight(startIso), end: civilMidnight(shiftISODate(endIsoInclusive, 1)) },
    windowSizeDays: 1,
  }
}

/** Split [start, end] into chunks the rollup endpoint accepts. */
export function chunkDateRange(
  startIso: string,
  endIsoInclusive: string,
  maxDays = GOOGLE_HEALTH_MAX_ROLLUP_DAYS,
): Array<{ start: string; end: string }> {
  const dates = listDatesInRange(startIso, endIsoInclusive)
  const chunks: Array<{ start: string; end: string }> = []
  for (let i = 0; i < dates.length; i += maxDays) {
    const slice = dates.slice(i, i + maxDays)
    chunks.push({ start: slice[0]!, end: slice[slice.length - 1]! })
  }
  return chunks
}

function civilToIso(c: unknown): string | null {
  const d = (c as { date?: { year?: number; month?: number; day?: number } } | undefined)?.date
  if (!d?.year || !d.month || !d.day) return null
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export type RollupField = 'steps' | 'totalCalories' | 'weight'

const ROLLUP_VALUE_KEY: Record<RollupField, string> = {
  steps: 'countSum',
  totalCalories: 'kcalSum',
  weight: 'weightGramsAvg',
}

/**
 * Map a dailyRollUp response to { 'YYYY-MM-DD': value }. Days with no data
 * (tracker not worn) are omitted, matching the API, which omits the value field.
 * Weight is returned in kg.
 */
export function parseDailyRollup(response: unknown, field: RollupField): Record<string, number> {
  const out: Record<string, number> = {}
  const points = (response as { rollupDataPoints?: unknown[] } | null)?.rollupDataPoints ?? []
  for (const p of points) {
    const rec = p as Record<string, unknown>
    const date = civilToIso(rec.civilStartTime)
    const value = rec[field] as Record<string, unknown> | undefined
    if (!date || !value) continue
    const n = toNumber(value[ROLLUP_VALUE_KEY[field]])
    if (n === null) continue
    out[date] = field === 'weight' ? Math.round((n / 1000) * 10) / 10 : Math.round(n)
  }
  return out
}

/** Google exercise types → the app's activity types. */
export function mapExerciseType(exerciseType: unknown): string {
  const t = typeof exerciseType === 'string' ? exerciseType.toUpperCase() : ''
  if (/RUN|JOG|TREADMILL/.test(t)) return 'Run'
  if (/BIK|CYCL|SPIN/.test(t)) return 'Ride'
  if (/SWIM/.test(t)) return 'Swim'
  if (/HIK/.test(t)) return 'Hike'
  if (/WALK/.test(t)) return 'Walk'
  if (/STRENGTH|WEIGHT|AEROBIC|HIIT|CROSSFIT|CIRCUIT|YOGA|PILATES|ELLIPTICAL|ROW|WORKOUT|TRAINING|BOOTCAMP|DANCE/.test(t))
    return 'Workout'
  return 'Other'
}

/** "1800s" / "1800.5s" → 1800 */
export function parseDurationSeconds(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const m = /^(-?\d+(?:\.\d+)?)s$/.exec(raw.trim())
  return m ? Math.round(Number.parseFloat(m[1]!)) : null
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

export interface MappedTrackerWorkout {
  externalId: string
  name: string
  activityType: string
  /** Local calendar date of the start, using the data point's own UTC offset. */
  activityDate: string
  loggedAt: string
  movingTimeSeconds: number
  distanceMeters: number | null
  averageHeartrate: number | null
  calories: number | null
}

/** Map one `exercise` data point to an activity, or null if it lacks the basics. */
export function mapExerciseDataPoint(dp: unknown): MappedTrackerWorkout | null {
  const rec = dp as Record<string, unknown>
  const ex = rec?.exercise as Record<string, unknown> | undefined
  const name = typeof rec?.name === 'string' ? rec.name : null
  const interval = ex?.interval as Record<string, unknown> | undefined
  const startTime = typeof interval?.startTime === 'string' ? interval.startTime : null
  if (!ex || !name || !startTime) return null

  const startMs = Date.parse(startTime)
  if (!Number.isFinite(startMs)) return null
  const offsetSec = parseDurationSeconds(interval?.startUtcOffset) ?? 0
  const activityDate = new Date(startMs + offsetSec * 1000).toISOString().slice(0, 10)

  const endMs = typeof interval?.endTime === 'string' ? Date.parse(interval.endTime) : NaN
  const active = parseDurationSeconds(ex.activeDuration)
  const movingTimeSeconds =
    active ?? (Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 1000)) : 0)

  const m = (ex.metricsSummary ?? {}) as Record<string, unknown>
  const distanceMm = toNumber(m.distanceMillimeters)
  const kcal = toNumber(m.caloriesKcal)
  const hr = toNumber(m.averageHeartRateBeatsPerMinute)
  const activityType = mapExerciseType(ex.exerciseType)
  const display = typeof ex.displayName === 'string' && ex.displayName.trim() ? ex.displayName.trim() : null

  return {
    externalId: name,
    name: display ?? (typeof ex.exerciseType === 'string' ? titleCase(ex.exerciseType) : activityType),
    activityType,
    activityDate,
    loggedAt: new Date(startMs).toISOString(),
    movingTimeSeconds,
    distanceMeters: distanceMm === null ? null : Math.round(distanceMm / 1000),
    averageHeartrate: hr === null ? null : Math.round(hr),
    calories: kcal === null ? null : Math.round(kcal),
  }
}

/** AIP-160 filter for exercise sessions starting in [startIso, endIso] (local civil time). */
export function exerciseFilter(startIso: string, endIsoInclusive: string): string {
  const next = shiftISODate(endIsoInclusive, 1)
  return `exercise.interval.civil_start_time >= "${startIso}T00:00:00" AND exercise.interval.civil_start_time < "${next}T00:00:00"`
}
