import { useEffect, useState } from 'react'
import { todayISOInTimeZone, WEIGHT_CHECKIN_OPTIONS } from '@macro_tracker/shared'
import Alert from '../ui/Alert'
import { useProfile } from '../../context/useProfile'
import { inputBase, labelBase } from '../../lib/styles'
import { fetchWeightCheckin, LB_PER_KG, saveWeightTrackingSettings, type WeightCheckinState } from '../../lib/weight'

export default function WeightTrackingSection() {
  const { profile } = useProfile()
  const today = todayISOInTimeZone(profile.timeZone)
  const [state, setState] = useState<WeightCheckinState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchWeightCheckin(today).then(setState, (err: Error) => setError(err.message))
  }, [today])

  async function save(next: { enabled: boolean; intervalDays: number }) {
    setSaving(true)
    setError(null)
    try {
      await saveWeightTrackingSettings(next)
      setState(await fetchWeightCheckin(today))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const enabled = state?.status.reason !== 'disabled'
  const interval = state?.status.intervalDays ?? 7
  const trend = state?.trend
  const lb = (kg: number) => Math.round(kg * LB_PER_KG * 10) / 10

  return (
    <section className="day-accordion" style={{ padding: 24, marginBottom: 24 }} aria-labelledby="weight-title">
      <h3 id="weight-title" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 4px 0' }}>
        Weight check-ins
      </h3>
      <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 20px 0' }}>
        Macro Tracker asks for your weight on a schedule so BMR and activity estimates stay accurate. Weekly is
        usually best: day-to-day readings mostly reflect water, not progress.
      </p>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {state && !state.available && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="info">Weight history turns on after the next database update.</Alert>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!state?.available || saving}
            onChange={(e) => void save({ enabled: e.target.checked, intervalDays: interval })}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: 14, fontWeight: 500 }}>Remind me to log my weight</span>
        </label>

        <div>
          <label htmlFor="weight-cadence" style={labelBase}>
            How often
          </label>
          <select
            id="weight-cadence"
            value={interval}
            disabled={!enabled || !state?.available || saving}
            onChange={(e) => void save({ enabled: true, intervalDays: Number(e.target.value) })}
            style={{ ...inputBase, maxWidth: 260 }}
          >
            {WEIGHT_CHECKIN_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {trend?.latestKg != null && (
          <p style={{ fontSize: 13, color: '#52525b', margin: 0 }}>
            Latest {trend.latestKg} kg ({lb(trend.latestKg)} lb) on {trend.latestOn}
            {trend.changeKg !== null &&
              ` · trend ${trend.changeKg > 0 ? '+' : ''}${trend.changeKg} kg over ${trend.windowDays} days`}
            {state?.status.nextDueOn && enabled ? ` · next check-in ${state.status.nextDueOn}` : ''}
          </p>
        )}
      </div>
    </section>
  )
}
