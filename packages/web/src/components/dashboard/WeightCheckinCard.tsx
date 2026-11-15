import { useEffect, useState } from 'react'
import Alert from '../ui/Alert'
import ZoneButton from '../layout/ZoneButton'
import { inputBase, labelBase } from '../../lib/styles'
import { fetchWeightCheckin, LB_PER_KG, saveWeight, snoozeWeightCheckin, type WeightCheckinState } from '../../lib/weight'

interface WeightCheckinCardProps {
  today: string
}

function defaultUnit(): 'kg' | 'lb' {
  try {
    return /^en-(US|LR|MM)$/i.test(navigator.language) ? 'lb' : 'kg'
  } catch {
    return 'kg'
  }
}

/** Shown on the dashboard only when a weight check-in is due. */
export default function WeightCheckinCard({ today }: WeightCheckinCardProps) {
  const [state, setState] = useState<WeightCheckinState | null>(null)
  const [unit, setUnit] = useState<'kg' | 'lb'>(defaultUnit)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    fetchWeightCheckin(today).then(setState, () => setState(null))
  }, [today])

  if (done) {
    return (
      <div style={{ marginBottom: 16 }}>
        <Alert variant="success">{done}</Alert>
      </div>
    )
  }
  if (!state?.status.due) return null

  const last = state.trend.latestKg
  const lastLabel =
    last === null ? null : unit === 'lb' ? `${Math.round(last * LB_PER_KG * 10) / 10} lb` : `${last} kg`
  const heading =
    state.status.reason === 'never_logged'
      ? 'Log your starting weight'
      : `Time for your ${state.status.intervalDays === 7 ? 'weekly ' : ''}weigh-in`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number.parseFloat(value)
    if (!Number.isFinite(n)) {
      setError('Enter your weight')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveWeight({ value: n, unit, measuredOn: today })
      setDone('Weight saved. BMR and estimates now use it.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="glass-strong"
      aria-labelledby="weight-checkin-title"
      style={{ borderRadius: 20, padding: 20, marginBottom: 16, border: '1px solid rgba(12, 65, 151, 0.14)' }}
    >
      <h2 id="weight-checkin-title" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, margin: '0 0 4px 0' }}>
        {heading}
      </h2>
      <p style={{ fontSize: 13, color: '#5a5e5c', margin: '0 0 14px 0' }}>
        {lastLabel ? `Last: ${lastLabel} on ${state.trend.latestOn}. ` : ''}
        Same time of day each check-in (ideally morning) keeps the trend meaningful.
      </p>
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label htmlFor="weight-checkin-value" style={labelBase}>
            Weight
          </label>
          <input
            id="weight-checkin-value"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={unit === 'lb' ? 'e.g. 180.4' : 'e.g. 81.8'}
            style={inputBase}
          />
        </div>
        <div role="group" aria-label="Unit" style={{ display: 'flex', gap: 4 }}>
          {(['lb', 'kg'] as const).map((u) => (
            <ZoneButton key={u} type="button" variant={unit === u ? 'primary' : 'secondary'} onClick={() => setUnit(u)} aria-pressed={unit === u}>
              {u}
            </ZoneButton>
          ))}
        </div>
        <ZoneButton type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </ZoneButton>
        <ZoneButton
          type="button"
          onClick={() => void snoozeWeightCheckin(today, 2).then(() => setDone('Okay, we will ask again in 2 days.'))}
        >
          Not today
        </ZoneButton>
      </form>
    </section>
  )
}
