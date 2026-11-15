import {
  buildGoogleAuthorizeUrl,
  chunkDateRange,
  GOOGLE_HEALTH_SCOPES,
  mapExerciseDataPoint,
  parseDailyRollup,
  parseFitnessSyncSettings,
  serializeFitnessSyncSettings,
  shiftISODate,
  todayISOInTimeZone,
  type FitnessSyncSettings,
  type MappedTrackerWorkout,
} from '@macro_tracker/shared'
import { signPayload, verifyPayload } from '../oauth/crypto.js'
import type { Json } from '@macro_tracker/shared'
import type { MacroTrackerSupabase } from '../supabase.js'
import { fetchUserTimeZone, requireUserId } from '../toolHandlers.js'
import {
  dailyRollUp,
  exchangeAuthorizationCode,
  GoogleReauthRequiredError,
  listExercises,
  refreshAccessToken,
  revokeToken,
} from './googleHealthClient.js'
import { decryptToken, encryptToken } from './tokenCrypto.js'

export const FITNESS_PROVIDER = 'google_health' as const
const MIGRATION_HINT = 'Fitness tracker sync needs database migration 0024_integrations_estimates_weight.sql.'
/** Longest range one sync call will pull (backfill on first connect). */
export const MAX_SYNC_DAYS = 30
const FIRST_SYNC_DAYS = 14

export interface IntegrationEnv {
  GOOGLE_HEALTH_CLIENT_ID?: string
  GOOGLE_HEALTH_CLIENT_SECRET?: string
  INTEGRATION_ENCRYPTION_KEY?: string
  OAUTH_SIGNING_SECRET?: string
  /** Public origin, used to build the OAuth redirect URI. */
  PUBLIC_URL?: string
}

interface ReadyEnv {
  GOOGLE_HEALTH_CLIENT_ID: string
  GOOGLE_HEALTH_CLIENT_SECRET: string
  INTEGRATION_ENCRYPTION_KEY: string
  OAUTH_SIGNING_SECRET: string
  PUBLIC_URL: string
}

export function integrationConfigured(env: IntegrationEnv | undefined): env is ReadyEnv {
  return Boolean(
    env?.GOOGLE_HEALTH_CLIENT_ID &&
      env.GOOGLE_HEALTH_CLIENT_SECRET &&
      env.INTEGRATION_ENCRYPTION_KEY &&
      env.OAUTH_SIGNING_SECRET &&
      env.PUBLIC_URL,
  )
}

function requireEnv(env: IntegrationEnv | undefined): ReadyEnv {
  if (!integrationConfigured(env)) {
    throw new Error(
      'Google Health is not configured on this server (set GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET, INTEGRATION_ENCRYPTION_KEY).',
    )
  }
  return env
}

export function googleHealthRedirectUri(env: { PUBLIC_URL: string }): string {
  return `${env.PUBLIC_URL.replace(/\/$/, '')}/api/integrations/google-health/callback`
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === '42P01' ||
        error.code === 'PGRST205' ||
        /relation .* does not exist|could not find the table/i.test(error.message ?? '')),
  )
}

// ── Connect ─────────────────────────────────────────────────────────────────

interface ConnectState {
  sub: string
  nonce: string
  exp: number
}

/** Step 1: a signed state ties the Google consent screen back to this user. */
export async function startGoogleHealthConnect(
  supabase: MacroTrackerSupabase,
  env: IntegrationEnv | undefined,
): Promise<{ url: string }> {
  const ready = requireEnv(env)
  const userId = await requireUserId(supabase)
  const state = await signPayload<ConnectState>(ready.OAUTH_SIGNING_SECRET, {
    sub: userId,
    nonce: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 600,
  })
  return {
    url: buildGoogleAuthorizeUrl({
      clientId: ready.GOOGLE_HEALTH_CLIENT_ID,
      redirectUri: googleHealthRedirectUri(ready),
      state,
    }),
  }
}

/** Step 2: the signed-in web app posts back the code Google returned. */
export async function completeGoogleHealthConnect(
  supabase: MacroTrackerSupabase,
  env: IntegrationEnv | undefined,
  args: { code: string; state: string },
  fetchImpl: typeof fetch = fetch,
): Promise<FitnessConnectionStatus> {
  const ready = requireEnv(env)
  const userId = await requireUserId(supabase)
  const state = await verifyPayload<ConnectState>(ready.OAUTH_SIGNING_SECRET, args.state)
  if (!state || state.sub !== userId) throw new Error('Connection request expired or belongs to another account. Try again.')

  const tokens = await exchangeAuthorizationCode(ready, args.code, googleHealthRedirectUri(ready), fetchImpl)
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Remove Macro Tracker under your Google Account > Security > Third-party access, then connect again.')
  }
  const granted = tokens.scope ? tokens.scope.split(' ') : [...GOOGLE_HEALTH_SCOPES]

  const { error } = await supabase.from('fitness_connections').upsert(
    {
      user_id: userId,
      provider: FITNESS_PROVIDER,
      status: 'active',
      scopes: granted,
      refresh_token_ciphertext: await encryptToken(ready.INTEGRATION_ENCRYPTION_KEY, tokens.refresh_token),
      access_token_ciphertext: await encryptToken(ready.INTEGRATION_ENCRYPTION_KEY, tokens.access_token),
      access_token_expires_at: new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString(),
      last_error: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  )
  if (error) throw new Error(isMissingTable(error) ? MIGRATION_HINT : error.message)

  // Mark the profile as tracker-based so the dashboard uses device totals.
  await supabase.from('profiles').update({ uses_wearable: true }).eq('id', userId)
  return getFitnessConnectionStatus(supabase)
}

// ── Status / settings / disconnect ──────────────────────────────────────────

export interface FitnessConnectionStatus {
  connected: boolean
  provider: typeof FITNESS_PROVIDER
  status: 'active' | 'needs_reauth' | 'error' | null
  settings: FitnessSyncSettings
  lastSyncedAt: string | null
  lastSyncSummary: unknown
  lastError: string | null
  connectedAt: string | null
}

export async function getFitnessConnectionStatus(supabase: MacroTrackerSupabase): Promise<FitnessConnectionStatus> {
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('fitness_connections')
    .select('status, settings, last_synced_at, last_sync_summary, last_error, connected_at')
    .eq('user_id', userId)
    .eq('provider', FITNESS_PROVIDER)
    .maybeSingle()
  if (error && !isMissingTable(error)) throw new Error(error.message)
  return {
    connected: Boolean(data),
    provider: FITNESS_PROVIDER,
    status: (data?.status as FitnessConnectionStatus['status']) ?? null,
    settings: parseFitnessSyncSettings(data?.settings),
    lastSyncedAt: data?.last_synced_at ?? null,
    lastSyncSummary: data?.last_sync_summary ?? null,
    lastError: data?.last_error ?? null,
    connectedAt: data?.connected_at ?? null,
  }
}

export async function updateFitnessSyncSettings(
  supabase: MacroTrackerSupabase,
  patch: Partial<FitnessSyncSettings>,
): Promise<FitnessConnectionStatus> {
  const current = await getFitnessConnectionStatus(supabase)
  if (!current.connected) throw new Error('No fitness tracker connected')
  const next = { ...current.settings, ...patch }
  const userId = await requireUserId(supabase)
  const { error } = await supabase
    .from('fitness_connections')
    .update({ settings: serializeFitnessSyncSettings(next), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', FITNESS_PROVIDER)
  if (error) throw new Error(error.message)
  return getFitnessConnectionStatus(supabase)
}

/** Revokes Google access and removes stored tokens. Synced history is kept. */
export async function disconnectGoogleHealth(
  supabase: MacroTrackerSupabase,
  env: IntegrationEnv | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<{ disconnected: true }> {
  const userId = await requireUserId(supabase)
  const { data } = await supabase
    .from('fitness_connections')
    .select('refresh_token_ciphertext')
    .eq('user_id', userId)
    .eq('provider', FITNESS_PROVIDER)
    .maybeSingle()
  if (data?.refresh_token_ciphertext && env?.INTEGRATION_ENCRYPTION_KEY) {
    try {
      await revokeToken(await decryptToken(env.INTEGRATION_ENCRYPTION_KEY, data.refresh_token_ciphertext), fetchImpl)
    } catch {
      // Best effort: the row is removed either way.
    }
  }
  const { error } = await supabase
    .from('fitness_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', FITNESS_PROVIDER)
  if (error && !isMissingTable(error)) throw new Error(error.message)
  return { disconnected: true }
}

// ── Sync ────────────────────────────────────────────────────────────────────

export interface FitnessSyncSummary {
  provider: typeof FITNESS_PROVIDER
  startDate: string
  endDate: string
  workoutsAdded: number
  workoutsUpdated: number
  calorieDays: number
  stepDays: number
  weightDays: number
  /** Today's tracker calories are partial, so the day's base stays on BMR until it ends. */
  notes: string[]
}

async function getAccessToken(
  supabase: MacroTrackerSupabase,
  env: ReadyEnv,
  userId: string,
  row: { refresh_token_ciphertext: string; access_token_ciphertext: string | null; access_token_expires_at: string | null },
  fetchImpl: typeof fetch,
): Promise<string> {
  const fresh = row.access_token_expires_at && Date.parse(row.access_token_expires_at) > Date.now() + 30_000
  if (fresh && row.access_token_ciphertext) {
    return decryptToken(env.INTEGRATION_ENCRYPTION_KEY, row.access_token_ciphertext)
  }
  const refreshToken = await decryptToken(env.INTEGRATION_ENCRYPTION_KEY, row.refresh_token_ciphertext)
  const tokens = await refreshAccessToken(env, refreshToken, fetchImpl)
  await supabase
    .from('fitness_connections')
    .update({
      access_token_ciphertext: await encryptToken(env.INTEGRATION_ENCRYPTION_KEY, tokens.access_token),
      access_token_expires_at: new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString(),
      ...(tokens.refresh_token
        ? { refresh_token_ciphertext: await encryptToken(env.INTEGRATION_ENCRYPTION_KEY, tokens.refresh_token) }
        : {}),
    })
    .eq('user_id', userId)
    .eq('provider', FITNESS_PROVIDER)
  return tokens.access_token
}

function clampRange(start: string, end: string): { start: string; end: string } {
  const earliest = shiftISODate(end, -(MAX_SYNC_DAYS - 1))
  return { start: start < earliest ? earliest : start, end }
}

export async function syncGoogleHealth(
  supabase: MacroTrackerSupabase,
  env: IntegrationEnv | undefined,
  opts: { startDate?: string; endDate?: string } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<FitnessSyncSummary> {
  const ready = requireEnv(env)
  const userId = await requireUserId(supabase)
  const timeZone = await fetchUserTimeZone(supabase)
  const today = todayISOInTimeZone(timeZone)

  const { data: conn, error: connError } = await supabase
    .from('fitness_connections')
    .select('refresh_token_ciphertext, access_token_ciphertext, access_token_expires_at, settings, last_synced_at')
    .eq('user_id', userId)
    .eq('provider', FITNESS_PROVIDER)
    .maybeSingle()
  if (connError) throw new Error(isMissingTable(connError) ? MIGRATION_HINT : connError.message)
  if (!conn) throw new Error('No fitness tracker connected. Connect Google Health in Macro Tracker > Profile > Fitness tracker.')

  const settings = parseFitnessSyncSettings(conn.settings)
  const lastDay = conn.last_synced_at ? todayISOInTimeZone(timeZone, new Date(conn.last_synced_at)) : null
  const defaultStart = lastDay ? shiftISODate(lastDay, -1) : shiftISODate(today, -(FIRST_SYNC_DAYS - 1))
  const endDate = opts.endDate && opts.endDate <= today ? opts.endDate : today
  const { start: startDate } = clampRange(opts.startDate ?? defaultStart, endDate)

  const summary: FitnessSyncSummary = {
    provider: FITNESS_PROVIDER,
    startDate,
    endDate,
    workoutsAdded: 0,
    workoutsUpdated: 0,
    calorieDays: 0,
    stepDays: 0,
    weightDays: 0,
    notes: [],
  }

  try {
    const token = await getAccessToken(supabase, ready, userId, conn, fetchImpl)
    const caloriesByDate: Record<string, number> = {}

    for (const chunk of chunkDateRange(startDate, endDate)) {
      if (settings.importCalories) {
        Object.assign(caloriesByDate, parseDailyRollup(await dailyRollUp(token, 'total-calories', chunk.start, chunk.end, fetchImpl), 'totalCalories'))
      }
      if (settings.importSteps) {
        const steps = parseDailyRollup(await dailyRollUp(token, 'steps', chunk.start, chunk.end, fetchImpl), 'steps')
        const rows = Object.entries(steps).map(([metric_date, value]) => ({
          user_id: userId,
          metric_date,
          steps: value,
          source: FITNESS_PROVIDER,
          updated_at: new Date().toISOString(),
        }))
        if (rows.length) {
          const { error } = await supabase.from('daily_metrics').upsert(rows, { onConflict: 'user_id,metric_date' })
          if (error) summary.notes.push(isMissingTable(error) ? `Steps skipped: ${MIGRATION_HINT}` : `Steps: ${error.message}`)
          else summary.stepDays += rows.length
        }
      }
      if (settings.importWeight) {
        const weights = parseDailyRollup(await dailyRollUp(token, 'weight', chunk.start, chunk.end, fetchImpl), 'weight')
        const rows = Object.entries(weights).map(([measured_on, kg]) => ({
          user_id: userId,
          measured_on,
          measured_at: `${measured_on}T12:00:00Z`,
          weight_kg: kg,
          source: 'device',
          external_id: `${FITNESS_PROVIDER}:weight:${measured_on}`,
          logged_via: 'sync',
        }))
        if (rows.length) {
          const { error } = await supabase
            .from('body_measurements')
            .upsert(rows, { onConflict: 'user_id,source,external_id' })
          if (error) summary.notes.push(`Weight: ${error.message}`)
          else summary.weightDays += rows.length
        }
      }
    }

    // Completed days only: a tracker's total for today is partial and would understate output.
    const completeDays = Object.entries(caloriesByDate).filter(([d]) => d < today)
    if (completeDays.length) {
      const { error } = await supabase.from('daily_device_totals').upsert(
        completeDays.map(([energy_date, kcal]) => ({
          user_id: userId,
          energy_date,
          device_total_kcal: Math.min(10000, Math.max(0, kcal)),
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'user_id,energy_date' },
      )
      if (error) throw new Error(`Calories: ${error.message}`)
      summary.calorieDays = completeDays.length
    }
    if (settings.importCalories && caloriesByDate[today] !== undefined) {
      summary.notes.push("Today's tracker calories are partial; today uses BMR until the day ends.")
    }

    if (settings.importWorkouts) {
      const workouts = (await listExercises(token, startDate, endDate, fetchImpl))
        .map(mapExerciseDataPoint)
        .filter((w): w is MappedTrackerWorkout => w !== null)
      const counted = (date: string) => settings.importCalories && date < today && caloriesByDate[date] !== undefined
      const result = await upsertTrackerWorkouts(supabase, userId, workouts, counted)
      summary.workoutsAdded = result.added
      summary.workoutsUpdated = result.updated
    }

    await supabase
      .from('fitness_connections')
      .update({
        status: 'active',
        last_synced_at: new Date().toISOString(),
        last_sync_summary: summary as unknown as Json,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', FITNESS_PROVIDER)
    return summary
  } catch (err) {
    const reauth = err instanceof GoogleReauthRequiredError
    await supabase
      .from('fitness_connections')
      .update({
        status: reauth ? 'needs_reauth' : 'error',
        last_error: (err as Error).message,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', FITNESS_PROVIDER)
    throw err
  }
}

/**
 * Insert new tracker workouts and refresh existing ones. Existing rows keep their id
 * (shares and exercises reference it), so this is select-then-write, not an upsert.
 */
async function upsertTrackerWorkouts(
  supabase: MacroTrackerSupabase,
  userId: string,
  workouts: MappedTrackerWorkout[],
  countedInDeviceTotal: (date: string) => boolean,
): Promise<{ added: number; updated: number }> {
  if (workouts.length === 0) return { added: 0, updated: 0 }
  const { data: existing, error } = await supabase
    .from('activities')
    .select('id, external_id')
    .eq('user_id', userId)
    .eq('source', FITNESS_PROVIDER)
    .in('external_id', workouts.map((w) => w.externalId))
  if (error) throw new Error(isMissingTable(error) || /source|external_id/.test(error.message) ? MIGRATION_HINT : error.message)
  const idByExternal = new Map((existing ?? []).map((r) => [r.external_id as string, r.id]))
  const now = new Date().toISOString()

  const fields = (w: MappedTrackerWorkout) => ({
    name: w.name,
    activity_type: w.activityType,
    activity_date: w.activityDate,
    created_at: w.loggedAt,
    moving_time_seconds: w.movingTimeSeconds,
    distance_meters: w.distanceMeters,
    average_heartrate: w.averageHeartrate,
    calories: w.calories,
    source: FITNESS_PROVIDER,
    external_id: w.externalId,
    log_method: 'device',
    confidence: 'high',
    counted_in_device_total: countedInDeviceTotal(w.activityDate),
    synced_at: now,
  })

  const inserts = workouts
    .filter((w) => !idByExternal.has(w.externalId))
    .map((w) => ({ id: crypto.randomUUID(), user_id: userId, max_heartrate: null, ...fields(w) }))
  if (inserts.length) {
    const { error: insertError } = await supabase.from('activities').insert(inserts)
    if (insertError) throw new Error(insertError.message)
  }

  let updated = 0
  for (const w of workouts) {
    const id = idByExternal.get(w.externalId)
    if (!id) continue
    const { error: updateError } = await supabase.from('activities').update(fields(w)).eq('id', id)
    if (updateError) throw new Error(updateError.message)
    updated++
  }
  return { added: inserts.length, updated }
}
