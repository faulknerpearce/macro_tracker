import {
  clampCheckinDays,
  estimateActivityCalories,
  getWeightCheckinStatus,
  LLM_ESTIMATION_GUIDE,
  mapProfileRow,
  parseIntensity,
  resolveBmr,
  shiftISODate,
  summarizeWeightTrend,
  todayISOInTimeZone,
  type WeightPoint,
} from '@macro_tracker/shared'
import {
  getFitnessConnectionStatus,
  integrationConfigured,
  syncGoogleHealth,
  type IntegrationEnv,
} from './integrations/fitnessSync.js'
import type { MacroTrackerSupabase } from './supabase.js'
import { fetchUserTimeZone, requireUserId, type ToolArgs } from './toolHandlers.js'

const LB_PER_KG = 2.20462
const MIGRATION_HINT = 'Run database migration 0024_integrations_estimates_weight.sql to enable this.'

function isMissingRelationOrColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '') ||
        /does not exist|could not find/i.test(error.message ?? '')),
  )
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

async function loadProfileRow(supabase: MacroTrackerSupabase, userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Profile not found')
  return data as Record<string, unknown>
}

async function loadWeights(
  supabase: MacroTrackerSupabase,
  userId: string,
  sinceIso: string,
): Promise<{ points: WeightPoint[]; available: boolean }> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('measured_on, weight_kg, source')
    .eq('user_id', userId)
    .gte('measured_on', sinceIso)
    .not('weight_kg', 'is', null)
    .order('measured_on', { ascending: true })
  if (error) {
    if (isMissingRelationOrColumn(error)) return { points: [], available: false }
    throw new Error(error.message)
  }
  return {
    points: (data ?? [])
      .map((r) => ({ measuredOn: r.measured_on, weightKg: num(r.weight_kg) ?? NaN }))
      .filter((p) => Number.isFinite(p.weightKg)),
    available: true,
  }
}

async function lastMeasuredOn(supabase: MacroTrackerSupabase, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('measured_on')
    .eq('user_id', userId)
    .not('weight_kg', 'is', null)
    .order('measured_on', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data?.measured_on ?? null
}

/** Everything an LLM needs to estimate food and activity for this user. */
export async function getUserContext(supabase: MacroTrackerSupabase, integrationEnv?: IntegrationEnv) {
  const userId = await requireUserId(supabase)
  const row = await loadProfileRow(supabase, userId)
  const profile = mapProfileRow(row as Parameters<typeof mapProfileRow>[0])
  const timeZone = profile.timeZone
  const today = todayISOInTimeZone(timeZone)

  const { points } = await loadWeights(supabase, userId, shiftISODate(today, -90))
  const trend = summarizeWeightTrend(points)
  const weightKg = trend.latestKg ?? profile.weightKg
  const bmr = resolveBmr({ ...profile, weightKg })

  const checkin = getWeightCheckinStatus({
    tracking: row.weight_tracking === true,
    intervalDays: num(row.weight_checkin_days) ?? 7,
    snoozedUntil: typeof row.weight_checkin_snoozed_until === 'string' ? row.weight_checkin_snoozed_until : null,
    lastMeasuredOn: trend.latestOn,
    today,
  })

  const tracker = await getFitnessConnectionStatus(supabase).catch(() => null)
  const missing = [
    profile.age === null && 'age',
    profile.heightCm === null && 'height',
    weightKg === null && 'weight',
  ].filter(Boolean)

  return {
    today,
    timeZone,
    profile: {
      displayName: profile.displayName,
      age: profile.age,
      sex: profile.gender,
      heightCm: profile.heightCm,
      weightKg,
      weightLb: weightKg === null ? null : Math.round(weightKg * LB_PER_KG * 10) / 10,
      weightMeasuredOn: trend.latestOn,
      missingForEstimates: missing,
    },
    energy: {
      bmrKcal: bmr.bmr,
      bmrSource: bmr.source,
      usesFitnessTracker: profile.usesWearable,
    },
    goals: profile.nutritionGoals,
    weight: {
      tracking: checkin.reason !== 'disabled',
      checkinDue: checkin.due,
      checkinReason: checkin.reason,
      checkinEveryDays: checkin.intervalDays,
      nextCheckinOn: checkin.nextDueOn,
      trendKg: trend.trendKg,
      changeKgLast30Days: trend.changeKg,
    },
    fitnessTracker: tracker?.connected
      ? {
          provider: 'Google Health',
          status: tracker.status,
          lastSyncedAt: tracker.lastSyncedAt,
          canSyncFromHere: integrationConfigured(integrationEnv),
        }
      : { provider: null, connected: false },
    estimationGuide: LLM_ESTIMATION_GUIDE,
  }
}

/** Calorie estimate for an activity using the user's latest weight. */
export async function estimateActivityForUser(supabase: MacroTrackerSupabase, args: ToolArgs) {
  const userId = await requireUserId(supabase)
  const durationMinutes = num(args.durationMinutes)
  if (durationMinutes === null || durationMinutes <= 0) throw new Error('durationMinutes is required')
  const activityType = typeof args.activityType === 'string' ? args.activityType : 'Other'
  const row = await loadProfileRow(supabase, userId)
  const timeZone = await fetchUserTimeZone(supabase)
  const { points } = await loadWeights(supabase, userId, shiftISODate(todayISOInTimeZone(timeZone), -90))
  const weightKg = summarizeWeightTrend(points).latestKg ?? num(row.weight_kg)
  return {
    activityType,
    durationMinutes,
    weightKgUsed: weightKg,
    ...estimateActivityCalories({
      activityType,
      durationMinutes,
      weightKg,
      intensity: parseIntensity(args.intensity),
      met: num(args.met),
      distanceKm: num(args.distanceKm),
    }),
  }
}

export async function logWeight(supabase: MacroTrackerSupabase, args: ToolArgs) {
  const userId = await requireUserId(supabase)
  const value = num(args.weight)
  if (value === null || value <= 0) throw new Error('weight is required')
  const unit = args.unit === 'lb' || args.unit === 'lbs' ? 'lb' : 'kg'
  const weightKg = Math.round((unit === 'lb' ? value / LB_PER_KG : value) * 100) / 100
  if (weightKg < 30 || weightKg > 300) throw new Error('Weight must be between 30 and 300 kg (66–660 lb)')
  const timeZone = await fetchUserTimeZone(supabase)
  const today = todayISOInTimeZone(timeZone)
  const measuredOn = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : today
  const bodyFat = num(args.bodyFatPct)

  const { error } = await supabase.from('body_measurements').insert({
    user_id: userId,
    measured_on: measuredOn,
    weight_kg: weightKg,
    body_fat_pct: bodyFat,
    note: typeof args.note === 'string' ? args.note.slice(0, 200) : '',
    source: 'manual',
    logged_via: 'mcp',
  })
  let historyAvailable = true
  if (error) {
    if (!isMissingRelationOrColumn(error)) throw new Error(error.message)
    historyAvailable = false
  }
  // Keep the profile weight (used for BMR) current, and clear any snooze.
  await supabase
    .from('profiles')
    .update({ weight_kg: Math.round(weightKg * 10) / 10, ...(historyAvailable ? { weight_checkin_snoozed_until: null } : {}) })
    .eq('id', userId)

  const { points } = await loadWeights(supabase, userId, shiftISODate(today, -30))
  const trend = summarizeWeightTrend(points)
  return {
    measuredOn,
    weightKg: Math.round(weightKg * 10) / 10,
    weightLb: Math.round(weightKg * LB_PER_KG * 10) / 10,
    trend,
    ...(historyAvailable ? {} : { note: `Saved to profile only. ${MIGRATION_HINT}` }),
  }
}

export async function getWeightHistory(supabase: MacroTrackerSupabase, args: ToolArgs) {
  const userId = await requireUserId(supabase)
  const days = Math.min(365, Math.max(7, Math.round(num(args.days) ?? 90)))
  const today = todayISOInTimeZone(await fetchUserTimeZone(supabase))
  const { points, available } = await loadWeights(supabase, userId, shiftISODate(today, -days))
  if (!available) return { points: [], note: MIGRATION_HINT }
  return {
    points: points.map((p) => ({ ...p, weightLb: Math.round(p.weightKg * LB_PER_KG * 10) / 10 })),
    trend: summarizeWeightTrend(points, days),
  }
}

export async function snoozeWeightCheckin(supabase: MacroTrackerSupabase, args: ToolArgs) {
  const userId = await requireUserId(supabase)
  const days = Math.min(7, Math.max(1, Math.round(num(args.days) ?? 2)))
  const today = todayISOInTimeZone(await fetchUserTimeZone(supabase))
  const until = shiftISODate(today, days)
  const { error } = await supabase.from('profiles').update({ weight_checkin_snoozed_until: until }).eq('id', userId)
  if (error) throw new Error(isMissingRelationOrColumn(error) ? MIGRATION_HINT : error.message)
  return { snoozedUntil: until }
}

export async function updateWeightCheckinSettings(supabase: MacroTrackerSupabase, args: ToolArgs) {
  const userId = await requireUserId(supabase)
  const patch: { weight_tracking?: boolean; weight_checkin_days?: number } = {}
  if (typeof args.enabled === 'boolean') patch.weight_tracking = args.enabled
  if (args.intervalDays !== undefined) patch.weight_checkin_days = clampCheckinDays(args.intervalDays)
  if (Object.keys(patch).length === 0) throw new Error('Pass enabled and/or intervalDays')
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw new Error(isMissingRelationOrColumn(error) ? MIGRATION_HINT : error.message)
  const today = todayISOInTimeZone(await fetchUserTimeZone(supabase))
  return getWeightCheckinStatus({
    tracking: (patch.weight_tracking as boolean | undefined) ?? true,
    intervalDays: (patch.weight_checkin_days as number | undefined) ?? 7,
    snoozedUntil: null,
    lastMeasuredOn: await lastMeasuredOn(supabase, userId),
    today,
  })
}

/**
 * Past entries matching a name, grouped, so the LLM can reuse the user's own numbers
 * ("my usual flat white") instead of estimating from scratch.
 */
export async function searchFoodHistory(supabase: MacroTrackerSupabase, args: ToolArgs) {
  const userId = await requireUserId(supabase)
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (query.length < 2) throw new Error('query must be at least 2 characters')
  const limit = Math.min(20, Math.max(1, Math.round(num(args.limit) ?? 8)))
  const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const { data, error } = await supabase
    .from('food_entries')
    .select('name, calories, protein, carbs, fat, fiber, caffeine, portion_unit, portion_quantity, reference_weight_grams, entry_date')
    .eq('user_id', userId)
    .ilike('name', pattern)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw new Error(error.message)

  const groups = new Map<string, NonNullable<typeof data>>()
  for (const row of data ?? []) {
    const key = row.name.trim().toLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)]! : 0
  }
  return [...groups.values()]
    .map((rows) => {
      const latest = rows[0]!
      return {
        name: latest.name,
        timesLogged: rows.length,
        lastLogged: latest.entry_date,
        latest: {
          calories: latest.calories,
          protein: latest.protein,
          carbs: latest.carbs,
          fat: latest.fat,
          fiber: latest.fiber,
          caffeine: latest.caffeine,
          portionUnit: latest.portion_unit,
          portionQuantity: latest.portion_quantity,
          referenceWeightGrams: latest.reference_weight_grams,
        },
        typicalCalories: median(rows.map((r) => r.calories)),
        calorieRange: [Math.min(...rows.map((r) => r.calories)), Math.max(...rows.map((r) => r.calories))],
      }
    })
    .sort((a, b) => b.timesLogged - a.timesLogged)
    .slice(0, limit)
}

export async function syncFitnessTracker(
  supabase: MacroTrackerSupabase,
  integrationEnv: IntegrationEnv | undefined,
  args: ToolArgs,
) {
  if (!integrationConfigured(integrationEnv)) {
    throw new Error(
      'Tracker sync runs on the hosted Macro Tracker server. Use the remote MCP endpoint, or tap Sync in Macro Tracker > Profile > Fitness tracker.',
    )
  }
  return syncGoogleHealth(supabase, integrationEnv, {
    startDate: typeof args.startDate === 'string' ? args.startDate : undefined,
    endDate: typeof args.endDate === 'string' ? args.endDate : undefined,
  })
}
