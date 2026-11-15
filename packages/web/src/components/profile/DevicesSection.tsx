import { useEffect, useState } from 'react'
import type { FitnessSyncSettings } from '@macro_tracker/shared'
import Alert from '../ui/Alert'
import ZoneButton from '../layout/ZoneButton'
import {
  completePendingGoogleHealthConnect,
  describeSync,
  disconnectFitnessTracker,
  fetchFitnessStatus,
  startGoogleHealthConnect,
  syncFitnessTracker,
  updateFitnessSettings,
  type FitnessConnectionStatus,
} from '../../lib/integrations'

const SETTING_ROWS: { key: keyof FitnessSyncSettings; label: string; help: string }[] = [
  {
    key: 'importWorkouts',
    label: 'Workouts',
    help: 'Runs, rides, lifts and other sessions appear in Outputs with their type and calories.',
  },
  {
    key: 'importCalories',
    label: 'Daily calories burned',
    help: "Your tracker's total for each finished day replaces BMR as the day's base. Synced workouts are not added twice.",
  },
  { key: 'importSteps', label: 'Steps', help: 'Daily step counts for trends.' },
  { key: 'importWeight', label: 'Weight', help: 'Weigh-ins from a connected scale count as check-ins.' },
]

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export default function DevicesSection() {
  const [status, setStatus] = useState<FitnessConnectionStatus | null>(null)
  const [busy, setBusy] = useState<string | null>('load')
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const completed = await completePendingGoogleHealthConnect()
        if (completed && !cancelled) {
          setStatus(completed)
          setBusy('sync')
          const summary = await syncFitnessTracker()
          if (!cancelled) setMessage({ kind: 'success', text: `Google Health connected. ${describeSync(summary)}` })
        }
        const next = await fetchFitnessStatus()
        if (!cancelled) setStatus(next)
      } catch (err) {
        if (!cancelled) setMessage({ kind: 'error', text: (err as Error).message })
      } finally {
        if (!cancelled) setBusy(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setMessage(null)
    try {
      await fn()
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const connected = status?.connected === true
  const needsReauth = status?.status === 'needs_reauth'

  return (
    <section className="day-accordion" style={{ padding: 24, marginBottom: 24 }} aria-labelledby="devices-title">
      <h3 id="devices-title" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 4px 0' }}>
        Fitness tracker
      </h3>
      <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 20px 0' }}>
        Connect Google Health (Fitbit, Pixel Watch and apps that write to it) to bring in workouts,
        daily calories, steps and weight automatically. Macro Tracker only reads your data.
      </p>

      {message && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant={message.kind}>{message.text}</Alert>
        </div>
      )}

      {busy === 'load' ? (
        <p style={{ fontSize: 13, color: '#71717a', margin: 0 }}>Checking connection…</p>
      ) : !connected ? (
        <ZoneButton variant="primary" onClick={() => run('connect', startGoogleHealthConnect)} disabled={busy !== null}>
          {busy === 'connect' ? 'Opening Google…' : 'Connect Google Health'}
        </ZoneButton>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              padding: '14px 16px',
              borderRadius: 12,
              background: needsReauth ? '#fff6e5' : '#ecfdf5',
            }}
          >
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: needsReauth ? '#c93400' : '#047857' }}>
                {needsReauth ? 'Google Health needs to be reconnected' : 'Google Health connected'}
              </p>
              <p style={{ fontSize: 12, color: '#52525b', margin: '2px 0 0 0' }}>
                {status?.lastSyncedAt ? `Last synced ${timeAgo(status.lastSyncedAt)}` : 'Not synced yet'}
                {status?.lastError && !needsReauth ? ` · ${status.lastError}` : ''}
              </p>
            </div>
            {needsReauth ? (
              <ZoneButton variant="primary" onClick={() => run('connect', startGoogleHealthConnect)} disabled={busy !== null}>
                Reconnect
              </ZoneButton>
            ) : (
              <ZoneButton
                variant="primary"
                disabled={busy !== null}
                onClick={() =>
                  run('sync', async () => {
                    const summary = await syncFitnessTracker()
                    setStatus(await fetchFitnessStatus())
                    setMessage({ kind: 'success', text: describeSync(summary) })
                  })
                }
              >
                {busy === 'sync' ? 'Syncing…' : 'Sync now'}
              </ZoneButton>
            )}
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, color: '#3f3f46', marginBottom: 8 }}>Bring in</legend>
            {SETTING_ROWS.map((row) => (
              <label key={row.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={status?.settings[row.key] ?? true}
                  disabled={busy !== null}
                  onChange={(e) =>
                    run('settings', async () => {
                      setStatus(await updateFitnessSettings({ [row.key]: e.target.checked }))
                    })
                  }
                  style={{ marginTop: 3, width: 18, height: 18 }}
                />
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#18181b' }}>{row.label}</span>
                  <span style={{ fontSize: 12, color: '#71717a' }}>{row.help}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <ZoneButton
              variant="danger"
              disabled={busy !== null}
              onClick={() => {
                if (!window.confirm('Disconnect Google Health? Data already synced stays in Macro Tracker.')) return
                void run('disconnect', async () => {
                  await disconnectFitnessTracker()
                  setStatus(await fetchFitnessStatus())
                  setMessage({ kind: 'info', text: 'Google Health disconnected. Synced history was kept.' })
                })
              }}
            >
              Disconnect
            </ZoneButton>
          </div>
        </div>
      )}
    </section>
  )
}
