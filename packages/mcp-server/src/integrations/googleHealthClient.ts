import {
  GOOGLE_HEALTH_API_BASE,
  GOOGLE_OAUTH_REVOKE_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  dailyRollUpBody,
  exerciseFilter,
} from '@input_output/shared'

export interface GoogleOAuthClientEnv {
  GOOGLE_HEALTH_CLIENT_ID: string
  GOOGLE_HEALTH_CLIENT_SECRET: string
}

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

/** Thrown when Google says the refresh token is no longer valid (user must reconnect). */
export class GoogleReauthRequiredError extends Error {
  constructor(message = 'Google Health access was revoked or expired; reconnect the tracker.') {
    super(message)
    this.name = 'GoogleReauthRequiredError'
  }
}

type FetchLike = typeof fetch

async function tokenRequest(
  body: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<GoogleTokenResponse> {
  const res = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    if (json.error === 'invalid_grant') throw new GoogleReauthRequiredError()
    throw new Error(`Google token request failed: ${String(json.error_description ?? json.error ?? res.status)}`)
  }
  return json as unknown as GoogleTokenResponse
}

export function exchangeAuthorizationCode(
  env: GoogleOAuthClientEnv,
  code: string,
  redirectUri: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResponse> {
  return tokenRequest(
    {
      code,
      client_id: env.GOOGLE_HEALTH_CLIENT_ID,
      client_secret: env.GOOGLE_HEALTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    },
    fetchImpl,
  )
}

export function refreshAccessToken(
  env: GoogleOAuthClientEnv,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResponse> {
  return tokenRequest(
    {
      refresh_token: refreshToken,
      client_id: env.GOOGLE_HEALTH_CLIENT_ID,
      client_secret: env.GOOGLE_HEALTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    },
    fetchImpl,
  )
}

export async function revokeToken(token: string, fetchImpl: FetchLike = fetch): Promise<void> {
  await fetchImpl(`${GOOGLE_OAUTH_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch(() => undefined)
}

async function apiRequest(
  accessToken: string,
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const res = await fetchImpl(`${GOOGLE_HEALTH_API_BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) throw new GoogleReauthRequiredError()
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`
    throw new Error(`Google Health API ${path.split(':')[0]}: ${msg}`)
  }
  return json
}

/** POST users/me/dataTypes/{type}/dataPoints:dailyRollUp for [start, end] (≤ 14 days). */
export function dailyRollUp(
  accessToken: string,
  dataType: 'steps' | 'total-calories' | 'weight',
  startIso: string,
  endIsoInclusive: string,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  return apiRequest(
    accessToken,
    `users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    { method: 'POST', body: JSON.stringify(dailyRollUpBody(startIso, endIsoInclusive)) },
    fetchImpl,
  )
}

/** All exercise sessions starting in [start, end], following pagination. */
export async function listExercises(
  accessToken: string,
  startIso: string,
  endIsoInclusive: string,
  fetchImpl: FetchLike = fetch,
): Promise<unknown[]> {
  const points: unknown[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ filter: exerciseFilter(startIso, endIsoInclusive), pageSize: '100' })
    if (pageToken) params.set('pageToken', pageToken)
    const json = (await apiRequest(
      accessToken,
      `users/me/dataTypes/exercise/dataPoints:reconcile?${params.toString()}`,
      { method: 'GET' },
      fetchImpl,
    )) as { dataPoints?: unknown[]; nextPageToken?: string } | null
    points.push(...(json?.dataPoints ?? []))
    pageToken = json?.nextPageToken
    if (!pageToken) break
  }
  return points
}
