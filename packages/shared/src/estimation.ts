/**
 * Estimation helpers shared by the web app and the MCP server.
 *
 * Food estimates are made by the user's LLM (it knows portions and recipes far better
 * than a lookup table); these helpers cover how precise a log is and the activity
 * energy estimates that need the user's body weight.
 */

/** How a food entry's amount was determined. */
export type FoodLogMethod = 'weighed' | 'unit' | 'estimate' | 'recipe' | 'barcode' | 'sync'
/** How an activity's numbers were determined. */
export type ActivityLogMethod = 'device' | 'measured' | 'estimate'
export type EstimateConfidence = 'high' | 'medium' | 'low'
export type ActivityIntensity = 'light' | 'moderate' | 'vigorous'

export const FOOD_LOG_METHODS: readonly FoodLogMethod[] = [
  'weighed',
  'unit',
  'estimate',
  'recipe',
  'barcode',
  'sync',
]
export const ACTIVITY_LOG_METHODS: readonly ActivityLogMethod[] = ['device', 'measured', 'estimate']
export const ESTIMATE_CONFIDENCES: readonly EstimateConfidence[] = ['high', 'medium', 'low']
export const ACTIVITY_INTENSITIES: readonly ActivityIntensity[] = ['light', 'moderate', 'vigorous']

export function parseFoodLogMethod(raw: unknown): FoodLogMethod | null {
  return typeof raw === 'string' && (FOOD_LOG_METHODS as readonly string[]).includes(raw)
    ? (raw as FoodLogMethod)
    : null
}

export function parseActivityLogMethod(raw: unknown): ActivityLogMethod | null {
  return typeof raw === 'string' && (ACTIVITY_LOG_METHODS as readonly string[]).includes(raw)
    ? (raw as ActivityLogMethod)
    : null
}

export function parseConfidence(raw: unknown): EstimateConfidence | null {
  return typeof raw === 'string' && (ESTIMATE_CONFIDENCES as readonly string[]).includes(raw)
    ? (raw as EstimateConfidence)
    : null
}

export function parseIntensity(raw: unknown): ActivityIntensity | null {
  return typeof raw === 'string' && (ACTIVITY_INTENSITIES as readonly string[]).includes(raw)
    ? (raw as ActivityIntensity)
    : null
}

/** Default confidence when the caller doesn't say: weighed > packaged unit > eyeballed. */
export function defaultFoodConfidence(method: FoodLogMethod | null): EstimateConfidence | null {
  switch (method) {
    case 'weighed':
    case 'barcode':
    case 'sync':
      return 'high'
    case 'unit':
    case 'recipe':
      return 'medium'
    case 'estimate':
      return 'low'
    default:
      return null
  }
}

export function defaultActivityConfidence(
  method: ActivityLogMethod | null,
): EstimateConfidence | null {
  if (method === 'device') return 'high'
  if (method === 'measured') return 'medium'
  if (method === 'estimate') return 'low'
  return null
}

/**
 * MET values (Compendium of Physical Activities, rounded) by app activity type and
 * intensity. Keys match the app's activity types; anything else falls back to Other.
 */
const MET_TABLE: Record<string, Record<ActivityIntensity, number>> = {
  Run: { light: 7.0, moderate: 9.8, vigorous: 11.8 },
  Ride: { light: 5.8, moderate: 8.0, vigorous: 10.0 },
  Swim: { light: 5.8, moderate: 8.3, vigorous: 10.0 },
  Walk: { light: 2.8, moderate: 3.5, vigorous: 5.0 },
  Hike: { light: 5.3, moderate: 6.0, vigorous: 7.8 },
  Workout: { light: 3.5, moderate: 5.0, vigorous: 6.0 },
  Other: { light: 3.0, moderate: 4.5, vigorous: 6.5 },
}

export function metForActivity(activityType: string, intensity: ActivityIntensity): number {
  const key = Object.keys(MET_TABLE).find(
    (k) => k.toLowerCase() === activityType.trim().toLowerCase(),
  )
  return (MET_TABLE[key ?? 'Other'] ?? MET_TABLE.Other)[intensity]
}

export interface ActivityEstimateInput {
  activityType: string
  durationMinutes: number
  weightKg: number | null
  intensity?: ActivityIntensity | null
  /** Overrides the table when the caller knows a better MET for the exact activity. */
  met?: number | null
  distanceKm?: number | null
}

export interface ActivityEstimate {
  /** Net kcal: energy above resting, so it adds cleanly on top of BMR. */
  calories: number
  met: number
  method: 'met' | 'distance'
  confidence: EstimateConfidence
  assumptions: string[]
}

/** Used only when the user has no weight on file; flagged as an assumption. */
export const ESTIMATE_FALLBACK_WEIGHT_KG = 70

/**
 * Estimate calories burned by an activity, net of resting energy.
 *
 * The app's day total is BMR (or a tracker's total) + activity calories, so the
 * resting share of the session (1 MET) is subtracted to avoid counting it twice.
 */
export function estimateActivityCalories(input: ActivityEstimateInput): ActivityEstimate {
  const assumptions: string[] = []
  const intensity = input.intensity ?? 'moderate'
  if (!input.intensity) assumptions.push('Intensity not given; assumed moderate.')

  let weightKg = input.weightKg
  if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0) {
    weightKg = ESTIMATE_FALLBACK_WEIGHT_KG
    assumptions.push(`No body weight on file; assumed ${ESTIMATE_FALLBACK_WEIGHT_KG} kg.`)
  }

  const hours = Math.max(0, input.durationMinutes) / 60
  const type = input.activityType.trim().toLowerCase()
  const distance = input.distanceKm ?? null

  // Running and walking cost scales with distance more than time.
  if (distance !== null && distance > 0 && (type === 'run' || type === 'walk' || type === 'hike')) {
    const perKgKm = type === 'run' ? 0.9 : type === 'hike' ? 0.75 : 0.5
    const calories = Math.round(perKgKm * weightKg * distance)
    return {
      calories,
      met: input.met ?? metForActivity(input.activityType, intensity),
      method: 'distance',
      confidence: assumptions.length === 0 ? 'medium' : 'low',
      assumptions: [...assumptions, `~${perKgKm} kcal per kg per km (net of resting).`],
    }
  }

  const met = input.met && input.met > 1 ? input.met : metForActivity(input.activityType, intensity)
  const calories = Math.max(0, Math.round((met - 1) * weightKg * hours))
  return {
    calories,
    met,
    method: 'met',
    confidence: assumptions.length === 0 && input.intensity ? 'medium' : 'low',
    assumptions: [...assumptions, `MET ${met} for ${input.activityType || 'activity'} (${intensity}).`],
  }
}

/**
 * Guidance the MCP server sends to the user's LLM. Kept here so the web app's
 * help text and the server say the same thing.
 */
export const LLM_ESTIMATION_GUIDE = [
  'Call get_user_context first: it has age, sex, height, latest weight, BMR, goals and units.',
  'Food: users may log by weight ("180 g chicken"), by a known unit ("1 bar", "2 slices", "1 cup"), or by description ("a bowl of pasta").',
  'For weight or unit logs, compute macros from standard nutrition references and set logMethod to weighed or unit.',
  'For descriptions, estimate a typical portion, state the portion you assumed in estimateNotes, set logMethod to estimate, and confidence to low or medium.',
  'Prefer the user\'s saved recipes (list_recipes) and past entries (search_food_history) when the description matches.',
  'Activity: if the user has a fitness tracker connected, call sync_fitness_tracker before adding a workout by hand, to avoid duplicates.',
  'If calories burned are unknown, call estimate_activity_calories (it uses the user\'s weight) and log with logMethod estimate.',
  'If get_user_context says a weight check-in is due, ask the user for their weight once, then call log_weight. Do not ask again if they decline; call snooze_weight_checkin.',
  'Never invent precision: round estimates (calories to 10 kcal, macros to 1 g) and say they are estimates.',
].join('\n')
