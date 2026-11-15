import {
  clampCheckinDays,
  getWeightCheckinStatus,
  shiftISODate,
  summarizeWeightTrend,
  type WeightCheckinStatus,
  type WeightTrend,
} from '@macro_tracker/shared'
import { supabase } from './supabase'

export const LB_PER_KG = 2.20462

export interface WeightCheckinState {
  status: WeightCheckinStatus
  trend: WeightTrend
  /** False until migration 0024 is applied (no weight history table yet). */
  available: boolean
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Not signed in')
  return data.user.id
}

function isMissing(message: string): boolean {
  return /body_measurements|weight_tracking|weight_checkin|schema cache|does not exist|could not find/i.test(message)
}

export async function fetchWeightCheckin(today: string): Promise<WeightCheckinState> {
  const userId = await requireUserId()
  const [profileRes, weightsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase
      .from('body_measurements')
      .select('measured_on, weight_kg')
      .eq('user_id', userId)
      .gte('measured_on', shiftISODate(today, -90))
      .not('weight_kg', 'is', null)
      .order('measured_on', { ascending: true }),
  ])
  const row = (profileRes.data ?? {}) as Record<string, unknown>
  const available = !weightsRes.error && 'weight_tracking' in row
  if (weightsRes.error && !isMissing(weightsRes.error.message)) throw new Error(weightsRes.error.message)

  const points = (weightsRes.data ?? []).map((r) => ({
    measuredOn: r.measured_on,
    weightKg: Number(r.weight_kg),
  }))
  const trend = summarizeWeightTrend(points)
  const status = getWeightCheckinStatus({
    tracking: available && row.weight_tracking === true,
    intervalDays: clampCheckinDays(row.weight_checkin_days),
    snoozedUntil: typeof row.weight_checkin_snoozed_until === 'string' ? row.weight_checkin_snoozed_until : null,
    lastMeasuredOn: trend.latestOn,
    today,
  })
  return { status, trend, available }
}

export async function saveWeight(input: { value: number; unit: 'kg' | 'lb'; measuredOn: string }): Promise<void> {
  const userId = await requireUserId()
  const kg = Math.round((input.unit === 'lb' ? input.value / LB_PER_KG : input.value) * 100) / 100
  if (!(kg >= 30 && kg <= 300)) throw new Error('Enter a weight between 30 and 300 kg (66–660 lb)')
  const { error } = await supabase.from('body_measurements').insert({
    user_id: userId,
    measured_on: input.measuredOn,
    weight_kg: kg,
    source: 'manual',
    logged_via: 'app',
  })
  if (error) throw new Error(isMissing(error.message) ? 'Weight history needs the latest database update.' : error.message)
  await supabase
    .from('profiles')
    .update({ weight_kg: Math.round(kg * 10) / 10, weight_checkin_snoozed_until: null })
    .eq('id', userId)
}

export async function snoozeWeightCheckin(today: string, days = 2): Promise<void> {
  const userId = await requireUserId()
  const { error } = await supabase
    .from('profiles')
    .update({ weight_checkin_snoozed_until: shiftISODate(today, days) })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

export async function saveWeightTrackingSettings(settings: { enabled: boolean; intervalDays: number }): Promise<void> {
  const userId = await requireUserId()
  const { error } = await supabase
    .from('profiles')
    .update({ weight_tracking: settings.enabled, weight_checkin_days: clampCheckinDays(settings.intervalDays) })
    .eq('id', userId)
  if (error) throw new Error(isMissing(error.message) ? 'Weight check-ins need the latest database update.' : error.message)
}
