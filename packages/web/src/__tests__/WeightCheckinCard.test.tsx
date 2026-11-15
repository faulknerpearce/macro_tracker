import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WeightCheckinCard from '../components/dashboard/WeightCheckinCard'
import { fetchWeightCheckin, saveWeight, snoozeWeightCheckin } from '../lib/weight'

vi.mock('../lib/weight', () => ({
  LB_PER_KG: 2.20462,
  fetchWeightCheckin: vi.fn(),
  saveWeight: vi.fn().mockResolvedValue(undefined),
  snoozeWeightCheckin: vi.fn().mockResolvedValue(undefined),
}))

const trend = { latestKg: 82, latestOn: '2026-11-08', trendKg: 82.3, changeKg: -0.6, windowDays: 30, points: 4 }
function state(due: boolean) {
  return {
    available: true,
    trend,
    status: {
      due,
      reason: due ? 'interval_elapsed' : 'not_due',
      intervalDays: 7,
      lastMeasuredOn: '2026-11-08',
      nextDueOn: '2026-11-15',
      daysSinceLast: 7,
    },
  }
}

describe('WeightCheckinCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when no check-in is due', async () => {
    vi.mocked(fetchWeightCheckin).mockResolvedValue(state(false) as never)
    const { container } = render(<WeightCheckinCard today="2026-11-15" />)
    await waitFor(() => expect(fetchWeightCheckin).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('asks for the weekly weigh-in and saves the entered weight', async () => {
    vi.mocked(fetchWeightCheckin).mockResolvedValue(state(true) as never)
    const user = userEvent.setup()
    render(<WeightCheckinCard today="2026-11-15" />)

    expect(await screen.findByRole('heading', { name: 'Time for your weekly weigh-in' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'kg' }))
    await user.type(screen.getByLabelText('Weight'), '81.4')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(saveWeight).toHaveBeenCalledWith({ value: 81.4, unit: 'kg', measuredOn: '2026-11-15' })
    expect(await screen.findByText(/Weight saved/)).toBeInTheDocument()
  })

  it('snoozes for two days on "Not today"', async () => {
    vi.mocked(fetchWeightCheckin).mockResolvedValue(state(true) as never)
    const user = userEvent.setup()
    render(<WeightCheckinCard today="2026-11-15" />)
    await user.click(await screen.findByRole('button', { name: 'Not today' }))
    expect(snoozeWeightCheckin).toHaveBeenCalledWith('2026-11-15', 2)
  })
})
