import { buildDailyEnergySnapshots, type DailyEnergySnapshot } from '@input_output/shared'
import { fetchDeviceTotalsByDate } from './deviceTotals'
import { supabase } from './supabase'

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  if (!user) throw new Error('Not signed in')
  return user.id
}

export async function fetchDailyEnergySnapshots(
  startDate: string,
  endDate: string,
  bmr: number,
): Promise<DailyEnergySnapshot[]> {
  const userId = await requireUserId()

  const [foodResult, activityResult, deviceByDate] = await Promise.all([
    supabase
      .from('food_entries')
      .select('entry_date, calories')
      .eq('user_id', userId)
      .gte('entry_date', startDate)
      .lte('entry_date', endDate),
    // '*' so this works before and after migration 0024 (counted_in_device_total);
    // filtered by owner because RLS also returns activities shared with this user.
    supabase
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .gte('activity_date', startDate)
      .lte('activity_date', endDate),
    fetchDeviceTotalsByDate(startDate, endDate),
  ])

  if (foodResult.error) throw new Error(foodResult.error.message)
  if (activityResult.error) throw new Error(activityResult.error.message)

  const intakeByDate: Record<string, number> = {}
  for (const row of foodResult.data ?? []) {
    intakeByDate[row.entry_date] = (intakeByDate[row.entry_date] ?? 0) + (row.calories ?? 0)
  }

  const activityByDate: Record<string, number> = {}
  for (const row of activityResult.data ?? []) {
    // Tracker workouts already inside that day's device total aren't added again.
    if (row.counted_in_device_total === true) continue
    activityByDate[row.activity_date] =
      (activityByDate[row.activity_date] ?? 0) + (row.calories ?? 0)
  }

  return buildDailyEnergySnapshots(
    startDate,
    endDate,
    intakeByDate,
    activityByDate,
    bmr,
    deviceByDate,
  )
}
