import {
  buildActivityInsertPayload,
  buildActivityUpdatePayload,
  buildInsertPayload,
  buildPortionPayload,
  buildUpdatePayload,
  parsePortionMeta,
  DEFAULT_NUTRITION_GOALS,
  DEFAULT_TIMEZONE,
  mapActivityExerciseRow,
  mapActivityRow,
  mapRow,
  parseActivityInput,
  parseEntryInput,
  parseLoggedAt,
  parseNutritionGoals,
  sumActivityTotals,
  sumTotals,
  type ActivityUpdate,
  type FoodUpdate,
  estimateActivityCalories,
  parseIntensity,
} from '@input_output/shared'
import type { InputOutputSupabase } from './supabase.js'
import { activityProvenance, foodProvenance, isMissingProvenanceColumn } from './provenance.js'

export type ToolArgs = Record<string, unknown>

export async function requireUserId(supabase: InputOutputSupabase): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  if (!user) throw new Error('Not authenticated')
  return user.id
}

async function fetchUserGoals(supabase: InputOutputSupabase) {
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('profiles')
    .select('nutrition_goals')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return parseNutritionGoals(data?.nutrition_goals ?? DEFAULT_NUTRITION_GOALS)
}

export async function fetchUserTimeZone(supabase: InputOutputSupabase): Promise<string> {
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('profiles')
    .select('time_zone')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  const tz = data?.time_zone
  return typeof tz === 'string' && tz.trim() !== '' ? tz : DEFAULT_TIMEZONE
}

export const FOOD_ENTRY_DELETE_FORBIDDEN =
  'Entry not found or you do not have permission to delete it'

export async function listFoodEntriesForDate(supabase: InputOutputSupabase, date: string) {
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('food_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('entry_date', date)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapRow)
}

export async function addFoodEntryForDate(
  supabase: InputOutputSupabase,
  date: string,
  args: ToolArgs,
) {
  const parsed = parseEntryInput(args)
  if (!parsed.ok) throw new Error(parsed.error)

  const userId = await requireUserId(supabase)
  const loggedAt = args.loggedAt === undefined ? undefined : parseLoggedAt(args.loggedAt)
  if (loggedAt && !loggedAt.ok) throw new Error(loggedAt.error)

  const portion = parsePortionMeta(args)
  const entry = {
    ...buildInsertPayload(parsed.value, crypto.randomUUID(), userId),
    entry_date: date,
    ...(loggedAt?.ok ? { created_at: loggedAt.value } : {}),
    ...(portion ? buildPortionPayload(portion) : {}),
  }
  let { data, error } = await supabase
    .from('food_entries')
    .insert({ ...entry, ...foodProvenance(args) })
    .select()
    .single()
  // Before migration 0024 the provenance columns don't exist: save the entry without them.
  if (error && isMissingProvenanceColumn(error)) {
    ;({ data, error } = await supabase.from('food_entries').insert(entry).select().single())
  }
  if (error) throw error
  return mapRow(data!)
}

export async function updateFoodEntry(supabase: InputOutputSupabase, args: ToolArgs) {
  if (typeof args.id !== 'string' || args.id === '') throw new Error('id is required')

  const partial: Record<string, unknown> = {
    name: args.name ?? ' ',
    description: typeof args.description === 'string' ? args.description : '',
    calories: typeof args.calories === 'number' ? args.calories : 0,
    protein: typeof args.protein === 'number' ? args.protein : 0,
    carbs: typeof args.carbs === 'number' ? args.carbs : 0,
    fat: typeof args.fat === 'number' ? args.fat : 0,
    fiber: typeof args.fiber === 'number' ? args.fiber : 0,
    caffeine: typeof args.caffeine === 'number' ? args.caffeine : 0,
  }
  if (typeof args.icon === 'string') partial.icon = args.icon
  if (typeof args.iconBg === 'string') partial.iconBg = args.iconBg
  if (typeof args.iconColor === 'string') partial.iconColor = args.iconColor

  const parsed = parseEntryInput(partial)
  if (!parsed.ok) throw new Error(parsed.error)
  const updates = buildUpdatePayload(parsed.value) as FoodUpdate
  const portion = parsePortionMeta(args)
  if (portion) {
    Object.assign(updates, buildPortionPayload(portion))
  }
  if (typeof args.date === 'string') updates.entry_date = args.date
  if (args.loggedAt !== undefined) {
    const loggedAt = parseLoggedAt(args.loggedAt)
    if (!loggedAt.ok) throw new Error(loggedAt.error)
    updates.created_at = loggedAt.value
  }

  const { data, error } = await supabase
    .from('food_entries')
    .update(updates)
    .eq('id', args.id)
    .select()
    .single()
  if (error) throw error
  return mapRow(data)
}

export async function deleteFoodEntry(supabase: InputOutputSupabase, args: ToolArgs) {
  if (typeof args.id !== 'string' || args.id === '') throw new Error('id is required')
  const { data, error } = await supabase
    .from('food_entries')
    .delete()
    .eq('id', args.id)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error(FOOD_ENTRY_DELETE_FORBIDDEN)
  return { ok: true as const }
}

export async function getDailyTotalsForDate(supabase: InputOutputSupabase, date: string) {
  const entries = await listFoodEntriesForDate(supabase, date)
  const totals = sumTotals(entries)
  const goals = await fetchUserGoals(supabase)
  return { totals, goals, date }
}

async function attachActivityExercises(
  supabase: InputOutputSupabase,
  activities: ReturnType<typeof mapActivityRow>[],
) {
  if (activities.length === 0) return activities

  const workoutActivityIds = activities
    .filter((activity) => activity.workoutId !== null)
    .map((activity) => activity.id)
  if (workoutActivityIds.length === 0) return activities

  const { data, error } = await supabase
    .from('activity_exercises')
    .select('*')
    .in('activity_id', workoutActivityIds)
    .order('sort_order', { ascending: true })
  if (error) throw error

  const exercisesByActivity = new Map<string, ReturnType<typeof mapActivityExerciseRow>[]>()
  for (const row of data ?? []) {
    const mapped = mapActivityExerciseRow(row)
    const list = exercisesByActivity.get(row.activity_id) ?? []
    list.push(mapped)
    exercisesByActivity.set(row.activity_id, list)
  }

  return activities.map((activity) => ({
    ...activity,
    exercises: exercisesByActivity.get(activity.id) ?? activity.exercises,
  }))
}

export async function listActivitiesForDate(supabase: InputOutputSupabase, date: string) {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('activity_date', date)
    .order('created_at', { ascending: true })
  if (error) throw error
  return attachActivityExercises(supabase, (data ?? []).map(mapActivityRow))
}

export async function addActivityForDate(
  supabase: InputOutputSupabase,
  date: string,
  args: ToolArgs,
) {
  const parsed = parseActivityInput(args)
  if (!parsed.ok) throw new Error(parsed.error)

  const userId = await requireUserId(supabase)
  const loggedAt = args.loggedAt === undefined ? undefined : parseLoggedAt(args.loggedAt)
  if (loggedAt && !loggedAt.ok) throw new Error(loggedAt.error)

  // No calories given: estimate them from the user's weight (MET-based, net of resting).
  let estimate: ReturnType<typeof estimateActivityCalories> | null = null
  if (parsed.value.calories === null && args.estimateCalories !== false) {
    const weightKg = await fetchLatestWeightKg(supabase, userId)
    estimate = estimateActivityCalories({
      activityType: parsed.value.activityType,
      durationMinutes: parsed.value.movingTimeSeconds / 60,
      weightKg,
      intensity: parseIntensity(args.intensity),
      met: typeof args.met === 'number' ? args.met : null,
      distanceKm: parsed.value.distanceMeters === null ? null : parsed.value.distanceMeters / 1000,
    })
    parsed.value.calories = estimate.calories
  }

  const activity = {
    ...buildActivityInsertPayload(parsed.value, crypto.randomUUID(), userId, date),
    ...(loggedAt?.ok ? { created_at: loggedAt.value } : {}),
  }
  const provenance = activityProvenance(
    args,
    estimate ? { logMethod: 'estimate', notes: estimate.assumptions.join(' ') } : {},
  )
  let { data, error } = await supabase
    .from('activities')
    .insert({ ...activity, ...provenance, ...(estimate ? { confidence: estimate.confidence } : {}) })
    .select()
    .single()
  if (error && isMissingProvenanceColumn(error)) {
    ;({ data, error } = await supabase.from('activities').insert(activity).select().single())
  }
  if (error) throw error
  const mapped = mapActivityRow(data!)
  return estimate ? { ...mapped, caloriesEstimate: estimate } : mapped
}

/** Latest weight from history if available, else the profile's weight. */
export async function fetchLatestWeightKg(
  supabase: InputOutputSupabase,
  userId: string,
): Promise<number | null> {
  const history = await supabase
    .from('body_measurements')
    .select('weight_kg')
    .eq('user_id', userId)
    .not('weight_kg', 'is', null)
    .order('measured_on', { ascending: false })
    .limit(1)
    .maybeSingle()
  const fromHistory = history.error ? null : Number(history.data?.weight_kg)
  if (fromHistory && Number.isFinite(fromHistory)) return fromHistory
  const { data } = await supabase.from('profiles').select('weight_kg').eq('id', userId).maybeSingle()
  const w = Number(data?.weight_kg)
  return Number.isFinite(w) && w > 0 ? w : null
}

export async function updateActivity(supabase: InputOutputSupabase, args: ToolArgs) {
  if (typeof args.id !== 'string' || args.id === '') throw new Error('id is required')

  const partial: Record<string, unknown> = {}
  if (args.name !== undefined) partial.name = args.name
  if (args.activityType !== undefined) partial.activityType = args.activityType
  if (args.activity_type !== undefined) partial.activity_type = args.activity_type
  if (args.durationMinutes !== undefined) partial.durationMinutes = args.durationMinutes
  if (args.movingTimeSeconds !== undefined) partial.movingTimeSeconds = args.movingTimeSeconds
  if (args.moving_time_seconds !== undefined) partial.moving_time_seconds = args.moving_time_seconds
  if (args.distanceKm !== undefined) partial.distanceKm = args.distanceKm
  if (args.distanceMeters !== undefined) partial.distanceMeters = args.distanceMeters
  if (args.distance_meters !== undefined) partial.distance_meters = args.distance_meters
  if (args.averageHeartrate !== undefined) partial.averageHeartrate = args.averageHeartrate
  if (args.average_heartrate !== undefined) partial.average_heartrate = args.average_heartrate
  if (args.maxHeartrate !== undefined) partial.maxHeartrate = args.maxHeartrate
  if (args.max_heartrate !== undefined) partial.max_heartrate = args.max_heartrate
  if (args.calories !== undefined) partial.calories = args.calories

  if (
    partial.movingTimeSeconds === undefined &&
    partial.moving_time_seconds === undefined &&
    partial.durationMinutes === undefined
  ) {
    throw new Error('at least one of durationMinutes or movingTimeSeconds is required')
  }
  if (partial.movingTimeSeconds === undefined && partial.moving_time_seconds === undefined) {
    partial.durationMinutes =
      typeof partial.durationMinutes === 'number' ? partial.durationMinutes : 1
  }

  const parsed = parseActivityInput(partial)
  if (!parsed.ok) throw new Error(parsed.error)
  const updates = buildActivityUpdatePayload(parsed.value) as ActivityUpdate
  if (typeof args.date === 'string') updates.activity_date = args.date
  if (args.loggedAt !== undefined) {
    const loggedAt = parseLoggedAt(args.loggedAt)
    if (!loggedAt.ok) throw new Error(loggedAt.error)
    updates.created_at = loggedAt.value
  }

  const { data, error } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', args.id)
    .select()
    .single()
  if (error) throw error
  return mapActivityRow(data)
}

export async function deleteActivity(supabase: InputOutputSupabase, args: ToolArgs) {
  if (typeof args.id !== 'string' || args.id === '') throw new Error('id is required')
  const { error } = await supabase.from('activities').delete().eq('id', args.id)
  if (error) throw error
  return { ok: true as const }
}

export async function getActivityTotalsForDate(supabase: InputOutputSupabase, date: string) {
  const entries = await listActivitiesForDate(supabase, date)
  return { totals: sumActivityTotals(entries), date }
}

export type ManageDayLogAction =
  | 'list'
  | 'add_food'
  | 'update_food'
  | 'delete_food'
  | 'add_activity'
  | 'update_activity'
  | 'delete_activity'

const MANAGE_DAY_LOG_ACTIONS: ManageDayLogAction[] = [
  'list',
  'add_food',
  'update_food',
  'delete_food',
  'add_activity',
  'update_activity',
  'delete_activity',
]

export function isManageDayLogAction(value: unknown): value is ManageDayLogAction {
  return typeof value === 'string' && MANAGE_DAY_LOG_ACTIONS.includes(value as ManageDayLogAction)
}

export async function manageDayLog(
  supabase: InputOutputSupabase,
  date: string,
  action: ManageDayLogAction,
  args: ToolArgs,
) {
  switch (action) {
    case 'list': {
      const [foodEntries, activityEntries, goals] = await Promise.all([
        listFoodEntriesForDate(supabase, date),
        listActivitiesForDate(supabase, date),
        fetchUserGoals(supabase),
      ])
      return {
        date,
        food: { entries: foodEntries, totals: sumTotals(foodEntries) },
        activities: { entries: activityEntries, totals: sumActivityTotals(activityEntries) },
        goals,
      }
    }
    case 'add_food':
      return addFoodEntryForDate(supabase, date, args)
    case 'update_food':
      return updateFoodEntry(supabase, { ...args, date })
    case 'delete_food':
      return deleteFoodEntry(supabase, args)
    case 'add_activity':
      return addActivityForDate(supabase, date, args)
    case 'update_activity':
      return updateActivity(supabase, { ...args, date })
    case 'delete_activity':
      return deleteActivity(supabase, args)
    default:
      throw new Error(`Unknown action: ${action}`)
  }
}