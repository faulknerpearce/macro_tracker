import { createAuthenticatedSupabase } from '../supabase.js'
import {
  completeGoogleHealthConnect,
  disconnectGoogleHealth,
  getFitnessConnectionStatus,
  startGoogleHealthConnect,
  syncGoogleHealth,
  updateFitnessSyncSettings,
  type IntegrationEnv,
} from './fitnessSync.js'

export interface IntegrationHttpEnv extends IntegrationEnv {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function escapeForScript(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/**
 * Google redirects the browser here (no Supabase session on this request). Hand the
 * one-time code to the signed-in app via sessionStorage, then open the Devices screen,
 * which finishes the exchange with the user's session.
 */
function callbackPage(url: URL): Response {
  const payload = JSON.stringify({
    code: url.searchParams.get('code') ?? '',
    state: url.searchParams.get('state') ?? '',
    error: url.searchParams.get('error') ?? '',
  })
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Connecting…</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;padding:40px;text-align:center">Finishing Google Health connection…
<script>try{sessionStorage.setItem('macro-tracker.googleHealthOAuth',${escapeForScript(payload)})}catch(e){}
location.replace('/#/profile');</script></body></html>`
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

/**
 * Routes /api/integrations/google-health/{action}.
 * Every action except `callback` requires `Authorization: Bearer <supabase access token>`.
 */
export async function handleGoogleHealthRequest(
  request: Request,
  env: IntegrationHttpEnv,
  action: string,
): Promise<Response> {
  const url = new URL(request.url)
  if (action === 'callback' && request.method === 'GET') return callbackPage(url)

  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return json({ error: 'Sign in required' }, 401)

  const supabase = createAuthenticatedSupabase(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, token)
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return json({ error: 'Session expired; sign in again' }, 401)

  const integrationEnv: IntegrationEnv = {
    ...env,
    PUBLIC_URL: env.PUBLIC_URL ?? `${url.protocol}//${url.host}`,
  }
  const body = request.method === 'POST' ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {}

  try {
    switch (`${request.method} ${action}`) {
      case 'GET status':
        return json(await getFitnessConnectionStatus(supabase))
      case 'POST start':
        return json(await startGoogleHealthConnect(supabase, integrationEnv))
      case 'POST exchange':
        if (typeof body.code !== 'string' || typeof body.state !== 'string') {
          return json({ error: 'code and state are required' }, 400)
        }
        return json(await completeGoogleHealthConnect(supabase, integrationEnv, { code: body.code, state: body.state }))
      case 'POST sync':
        return json(
          await syncGoogleHealth(supabase, integrationEnv, {
            startDate: typeof body.startDate === 'string' ? body.startDate : undefined,
            endDate: typeof body.endDate === 'string' ? body.endDate : undefined,
          }),
        )
      case 'POST settings':
        return json(await updateFitnessSyncSettings(supabase, body as Record<string, boolean>))
      case 'POST disconnect':
        return json(await disconnectGoogleHealth(supabase, integrationEnv))
      default:
        return json({ error: 'Not found' }, 404)
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 400)
  }
}
