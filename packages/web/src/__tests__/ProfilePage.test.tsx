import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ProfilePage from '../pages/ProfilePage'
import { createProfileContextValue, mockProfile, renderWithProviders } from './testUtils'

// The device and weight sections talk to the network; keep them quiet here.
vi.mock('../lib/integrations', () => ({
  completePendingGoogleHealthConnect: vi.fn().mockResolvedValue(null),
  fetchFitnessStatus: vi.fn().mockResolvedValue({ connected: false, status: null, settings: {} }),
  startGoogleHealthConnect: vi.fn(),
  syncFitnessTracker: vi.fn(),
  updateFitnessSettings: vi.fn(),
  disconnectFitnessTracker: vi.fn(),
  describeSync: vi.fn(() => ''),
}))
vi.mock('../lib/weight', () => ({
  LB_PER_KG: 2.20462,
  fetchWeightCheckin: vi.fn().mockResolvedValue({
    available: true,
    status: { due: false, reason: 'disabled', intervalDays: 7, lastMeasuredOn: null, nextDueOn: null, daysSinceLast: null },
    trend: { latestKg: null, latestOn: null, trendKg: null, changeKg: null, windowDays: 30, points: 0 },
  }),
  saveWeightTrackingSettings: vi.fn(),
}))

describe('ProfilePage', () => {
  it('shows a loading state while the profile is fetched', () => {
    renderWithProviders(<ProfilePage />, {
      profile: createProfileContextValue({ loading: true }),
    })

    expect(screen.getByRole('status')).toHaveTextContent('Loading profile...')
  })

  it('renders the profile form with the current display name', () => {
    renderWithProviders(<ProfilePage />, {
      profile: createProfileContextValue(),
    })

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveValue('Alex')
  })

  it('saves profile updates', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ error: null })
    const user = userEvent.setup()
    renderWithProviders(<ProfilePage />, {
      profile: createProfileContextValue({ updateProfile }),
    })

    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Jordan')
    const saveButtons = screen.getAllByRole('button', { name: 'Save Profile' })
    await user.click(saveButtons[0])

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Jordan',
          age: mockProfile.age,
          heightCm: mockProfile.heightCm,
          weightKg: mockProfile.weightKg,
        }),
      )
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows validation errors from updateProfile', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ error: 'Display name is required' })
    const user = userEvent.setup()
    renderWithProviders(<ProfilePage />, {
      profile: createProfileContextValue({ updateProfile }),
    })

    const saveButtons = screen.getAllByRole('button', { name: 'Save Profile' })
    await user.click(saveButtons[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('Display name is required')
  })
})
