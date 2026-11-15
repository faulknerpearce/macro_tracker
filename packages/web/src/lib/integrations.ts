import type { FitnessSyncSettings } from '@macro_tracker/shared'
import { supabase } from './supabase'

const BASE = '/api/integrations/google-health'
const OAUTH_STORAGE_KEY = 'bodyio.googleHealthOAuth'
/** Auto-sync at most this often when the app opens. */
const AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000

export interface FitnessConnectionStatus {
  connected: boolean
  provider: 'google_health'
  status: 'active' | 'needs_reauth' | 'error' | null
  settings: FitnessSyncSettings
  lastSyncedAt: string | null
  lastSyncSummary: FitnessSyncSummary | null
  lastError: string | null
  connectedAt: string | null
}

export interface FitnessSyncSummary {
  startDate: string
  endDate: string
  workoutsAdded: number
  workoutsUpdated: number
  calorieDays: number
  stepDays: number
  weightDays: number
  notes: string[]
}

async function call<T>(action: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in again to manage devices')
  const res = await fetch(`${BASE}/${action}`, {
    method: init.method ?? 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json as T
}

export function fetchFitnessStatus(): Promise<FitnessConnectionStatus> {
  return call('status', { method: 'GET' })
}

/** Sends the browser to Google's consent screen. */
export async function startGoogleHealthConnect(): Promise<void> {
  const { url } = await call<{ url: string }>('start')
  window.location.assign(url)
}

/**
 * After Google redirects back, the callback page leaves the one-time code in
 * sessionStorage. Finish the exchange with the signed-in session. Returns null when
 * there is nothing pending.
 */
export async function completePendingGoogleHealthConnect(): Promise<FitnessConnectionStatus | null> {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(OAUTH_STORAGE_KEY)
    sessionStorage.removeItem(OAUTH_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  const pending = JSON.parse(raw) as { code?: string; state?: string; error?: string }
  if (pending.error) {
    throw new Error(pending.error === 'access_denied' ? 'Google Health access was not granted.' : pending.error)
  }
  if (!pending.code || !pending.state) return null
  return call('exchange', { body: { code: pending.code, state: pending.state } })
}

export function syncFitnessTracker(range?: { startDate?: string; endDate?: string }): Promise<FitnessSyncSummary> {
  return call('sync', { body: range ?? {} })
}

export function updateFitnessSettings(patch: Partial<FitnessSyncSettings>): Promise<FitnessConnectionStatus> {
  return call('settings', { body: patch })
}

export function disconnectFitnessTracker(): Promise<{ disconnected: true }> {
  return call('disconnect')
}

/** Sync in the background if connected and the last sync is over an hour old. */
export async function autoSyncIfStale(): Promise<FitnessSyncSummary | null> {
  try {
    const status = await fetchFitnessStatus()
    if (!status.connected || status.status === 'needs_reauth') return null
    const last = status.lastSyncedAt ? Date.parse(status.lastSyncedAt) : 0
    if (Date.now() - last < AUTO_SYNC_INTERVAL_MS) return null
    return await syncFitnessTracker()
  } catch {
    return null
  }
}

export function describeSync(summary: FitnessSyncSummary): string {
  const parts = [
    summary.workoutsAdded && `${summary.workoutsAdded} new workout${summary.workoutsAdded === 1 ? '' : 's'}`,
    summary.calorieDays && `calories for ${summary.calorieDays} day${summary.calorieDays === 1 ? '' : 's'}`,
    summary.stepDays && `steps for ${summary.stepDays} day${summary.stepDays === 1 ? '' : 's'}`,
    summary.weightDays && `${summary.weightDays} weigh-in${summary.weightDays === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return parts.length ? `Synced ${parts.join(', ')}.` : 'Up to date; nothing new from your tracker.'
}
