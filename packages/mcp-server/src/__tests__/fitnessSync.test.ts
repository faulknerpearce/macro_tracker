import { describe, expect, it } from 'vitest'
import { decryptToken, encryptToken } from '../integrations/tokenCrypto.js'
import { syncGoogleHealth, type IntegrationEnv } from '../integrations/fitnessSync.js'
import { handleGoogleHealthRequest } from '../integrations/http.js'
import { activityProvenance, foodProvenance, isMissingProvenanceColumn } from '../provenance.js'
import type { MacroTrackerSupabase } from '../supabase.js'

const KEY = 'test-encryption-key-that-is-at-least-32-chars'

describe('tokenCrypto', () => {
  it('round-trips and uses a fresh IV each time', async () => {
    const a = await encryptToken(KEY, 'refresh-123')
    const b = await encryptToken(KEY, 'refresh-123')
    expect(a).not.toBe(b)
    expect(await decryptToken(KEY, a)).toBe('refresh-123')
  })

  it('rejects the wrong key and short keys', async () => {
    const ct = await encryptToken(KEY, 'x')
    await expect(decryptToken(`${KEY}-other`, ct)).rejects.toThrow()
    await expect(encryptToken('short', 'x')).rejects.toThrow(/32 characters/)
  })
})

describe('provenance', () => {
  it('maps food log method with a default confidence', () => {
    expect(foodProvenance({ logMethod: 'estimate', estimateNotes: ' ~1 cup ' })).toEqual({
      logged_via: 'mcp',
      log_method: 'estimate',
      confidence: 'low',
      estimate_notes: '~1 cup',
    })
    expect(foodProvenance({ logMethod: 'nonsense' })).toEqual({ logged_via: 'mcp' })
  })

  it('marks estimated activities and keeps intensity', () => {
    expect(activityProvenance({ intensity: 'vigorous' }, { logMethod: 'estimate', notes: 'MET 9.8' })).toEqual({
      source: 'mcp',
      log_method: 'estimate',
      confidence: 'low',
      intensity: 'vigorous',
      estimate_notes: 'MET 9.8',
    })
  })

  it('detects missing provenance columns only', () => {
    expect(isMissingProvenanceColumn({ code: 'PGRST204', message: "Could not find the 'log_method' column" })).toBe(true)
    expect(isMissingProvenanceColumn({ code: '23505', message: 'duplicate key' })).toBe(false)
  })
})

describe('handleGoogleHealthRequest', () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' }

  it('requires a session for API actions', async () => {
    const res = await handleGoogleHealthRequest(new Request('https://app/api/integrations/google-health/status'), env, 'status')
    expect(res.status).toBe(401)
  })

  it('hands the OAuth code to the app via sessionStorage without HTML injection', async () => {
    const res = await handleGoogleHealthRequest(
      new Request('https://app/api/integrations/google-health/callback?code=abc&state=%3C/script%3E'),
      env,
      'callback',
    )
    const html = await res.text()
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(html).toContain("sessionStorage.setItem('bodyio.googleHealthOAuth'")
    expect(html).not.toContain('</script>"')
    expect(html).toContain("location.replace('/#/profile')")
  })
})

// ── syncGoogleHealth with a fake database and a fake Google API ─────────────

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]>; opts?: unknown }

function fakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  const calls: Call[] = []
  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] }
    const result = () => {
      if (call.op !== 'select') return { data: null, error: null }
      const rows = (tables[table] ?? []).filter((r) =>
        call.filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)),
      )
      return { data: rows, error: null }
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (k: string, v: unknown) => (call.filters.push([k, v]), chain),
      in: (k: string, v: unknown[]) => (call.filters.push([k, v]), chain),
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      gte: () => chain,
      update: (p: unknown) => ((call.op = 'update'), (call.payload = p), chain),
      insert: (p: unknown) => ((call.op = 'insert'), (call.payload = p), chain),
      upsert: (p: unknown, o: unknown) => ((call.op = 'upsert'), (call.payload = p), (call.opts = o), chain),
      delete: () => ((call.op = 'delete'), chain),
      maybeSingle: async () => {
        const r = result()
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : null, error: null }
      },
      then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
    }
    calls.push(call)
    return chain
  }
  const client = {
    from,
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  } as unknown as MacroTrackerSupabase
  return { client, calls }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('syncGoogleHealth', () => {
  it('imports completed-day calories, steps, weight and workouts without double counting', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const civil = (iso: string) => {
      const [year, month, day] = iso.split('-').map(Number)
      return { date: { year, month, day } }
    }
    const env: IntegrationEnv = {
      GOOGLE_HEALTH_CLIENT_ID: 'cid',
      GOOGLE_HEALTH_CLIENT_SECRET: 'secret',
      INTEGRATION_ENCRYPTION_KEY: KEY,
      OAUTH_SIGNING_SECRET: 'sign',
      PUBLIC_URL: 'https://app',
    }
    const { client, calls } = fakeSupabase({
      profiles: [{ id: 'u1', time_zone: 'UTC' }],
      fitness_connections: [
        {
          user_id: 'u1',
          provider: 'google_health',
          refresh_token_ciphertext: await encryptToken(KEY, 'refresh'),
          access_token_ciphertext: null,
          access_token_expires_at: null,
          settings: {},
          last_synced_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        },
      ],
      activities: [],
    })

    const requests: string[] = []
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`)
      if (url.includes('oauth2.googleapis.com/token')) return jsonResponse({ access_token: 'at', expires_in: 3600 })
      if (url.includes('total-calories')) {
        return jsonResponse({
          rollupDataPoints: [
            { civilStartTime: civil(today), totalCalories: { kcalSum: 900 } },
            { civilStartTime: civil(yesterday), totalCalories: { kcalSum: 2450 } },
          ],
        })
      }
      if (url.includes('/steps/')) return jsonResponse({ rollupDataPoints: [{ civilStartTime: civil(yesterday), steps: { countSum: '8123' } }] })
      if (url.includes('/weight/')) return jsonResponse({ rollupDataPoints: [{ civilStartTime: civil(yesterday), weight: { weightGramsAvg: 82000 } }] })
      if (url.includes('/exercise/')) {
        return jsonResponse({
          dataPoints: [
            {
              name: 'ex/1',
              exercise: {
                interval: { startTime: `${yesterday}T15:00:00Z`, startUtcOffset: '0s' },
                exerciseType: 'RUNNING',
                activeDuration: '1800s',
                metricsSummary: { caloriesKcal: 350 },
              },
            },
          ],
        })
      }
      return jsonResponse({}, 404)
    }) as typeof fetch

    const summary = await syncGoogleHealth(client, env, {}, fakeFetch)

    expect(summary).toMatchObject({ calorieDays: 1, stepDays: 1, weightDays: 1, workoutsAdded: 1, workoutsUpdated: 0 })
    expect(summary.notes.join(' ')).toMatch(/partial/)
    expect(requests[0]).toBe('POST https://oauth2.googleapis.com/token')

    const deviceUpsert = calls.find((c) => c.table === 'daily_device_totals' && c.op === 'upsert')
    expect(deviceUpsert?.payload).toEqual([
      expect.objectContaining({ energy_date: yesterday, device_total_kcal: 2450 }),
    ])

    const insert = calls.find((c) => c.table === 'activities' && c.op === 'insert')
    expect(insert?.payload).toEqual([
      expect.objectContaining({
        activity_type: 'Run',
        external_id: 'ex/1',
        source: 'google_health',
        calories: 350,
        counted_in_device_total: true,
        log_method: 'device',
      }),
    ])

    const finalUpdate = calls.filter((c) => c.table === 'fitness_connections' && c.op === 'update').at(-1)
    expect(finalUpdate?.payload).toMatchObject({ status: 'active', last_error: null })
  })
})
