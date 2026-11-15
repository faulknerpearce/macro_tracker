import { describe, expect, it } from 'vitest'
import {
  defaultFoodConfidence,
  estimateActivityCalories,
  metForActivity,
  parseFoodLogMethod,
} from '../estimation.js'
import {
  clampCheckinDays,
  getWeightCheckinStatus,
  summarizeWeightTrend,
} from '../weightCheckin.js'
import {
  buildGoogleAuthorizeUrl,
  chunkDateRange,
  dailyRollUpBody,
  exerciseFilter,
  mapExerciseDataPoint,
  mapExerciseType,
  parseDailyRollup,
  parseDurationSeconds,
  parseFitnessSyncSettings,
} from '../googleHealth.js'

describe('estimateActivityCalories', () => {
  it('uses net MET (minus resting) times weight and hours', () => {
    const e = estimateActivityCalories({
      activityType: 'Workout',
      durationMinutes: 60,
      weightKg: 80,
      intensity: 'moderate',
    })
    // (5.0 - 1) * 80 * 1
    expect(e.calories).toBe(320)
    expect(e.method).toBe('met')
    expect(e.confidence).toBe('medium')
  })

  it('prefers distance for runs and walks', () => {
    const e = estimateActivityCalories({
      activityType: 'run',
      durationMinutes: 30,
      weightKg: 70,
      distanceKm: 5,
      intensity: 'moderate',
    })
    expect(e.method).toBe('distance')
    expect(e.calories).toBe(315)
  })

  it('flags missing weight and intensity as assumptions with low confidence', () => {
    const e = estimateActivityCalories({ activityType: 'Ride', durationMinutes: 45, weightKg: null })
    expect(e.confidence).toBe('low')
    expect(e.assumptions.join(' ')).toMatch(/assumed 70 kg/)
    expect(e.assumptions.join(' ')).toMatch(/assumed moderate/)
  })

  it('falls back to Other for unknown activity types', () => {
    expect(metForActivity('Pickleball', 'moderate')).toBe(4.5)
  })
})

describe('food log method', () => {
  it('parses known methods and defaults confidence by method', () => {
    expect(parseFoodLogMethod('weighed')).toBe('weighed')
    expect(parseFoodLogMethod('guess')).toBeNull()
    expect(defaultFoodConfidence('weighed')).toBe('high')
    expect(defaultFoodConfidence('unit')).toBe('medium')
    expect(defaultFoodConfidence('estimate')).toBe('low')
  })
})

describe('weight check-in', () => {
  const base = { tracking: true, intervalDays: 7, snoozedUntil: null }

  it('is due when never logged', () => {
    const s = getWeightCheckinStatus({ ...base, lastMeasuredOn: null, today: '2026-11-15' })
    expect(s).toMatchObject({ due: true, reason: 'never_logged' })
  })

  it('is due once the interval has elapsed and not before', () => {
    expect(
      getWeightCheckinStatus({ ...base, lastMeasuredOn: '2026-11-08', today: '2026-11-15' }),
    ).toMatchObject({ due: true, reason: 'interval_elapsed', nextDueOn: '2026-11-15', daysSinceLast: 7 })
    expect(
      getWeightCheckinStatus({ ...base, lastMeasuredOn: '2026-11-09', today: '2026-11-15' }),
    ).toMatchObject({ due: false, reason: 'not_due' })
  })

  it('respects snooze and the tracking toggle', () => {
    expect(
      getWeightCheckinStatus({ ...base, snoozedUntil: '2026-11-16', lastMeasuredOn: null, today: '2026-11-15' }).reason,
    ).toBe('snoozed')
    expect(
      getWeightCheckinStatus({ ...base, tracking: false, lastMeasuredOn: null, today: '2026-11-15' }).due,
    ).toBe(false)
  })

  it('clamps the interval to 3–30 days', () => {
    expect(clampCheckinDays(1)).toBe(3)
    expect(clampCheckinDays(90)).toBe(30)
    expect(clampCheckinDays('x')).toBe(7)
  })

  it('smooths the weight trend', () => {
    const t = summarizeWeightTrend([
      { measuredOn: '2026-11-01', weightKg: 84 },
      { measuredOn: '2026-11-08', weightKg: 83 },
      { measuredOn: '2026-11-15', weightKg: 82.4 },
    ])
    expect(t.latestKg).toBe(82.4)
    expect(t.trendKg).toBeGreaterThan(82.4)
    expect(t.changeKg).toBeLessThan(0)
  })
})

describe('Google Health mapping', () => {
  it('builds an offline consent URL with the health scopes', () => {
    const url = new URL(buildGoogleAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://x/cb', state: 's' }))
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('scope')).toMatch(/googlehealth\.activity_and_fitness\.readonly/)
    expect(url.searchParams.has('include_granted_scopes')).toBe(false)
  })

  it('makes a closed-open civil range for dailyRollUp', () => {
    const body = dailyRollUpBody('2026-11-01', '2026-11-14')
    expect(body.range.start.date).toEqual({ year: 2026, month: 11, day: 1 })
    expect(body.range.end.date).toEqual({ year: 2026, month: 11, day: 15 })
  })

  it('chunks ranges into 14-day windows', () => {
    expect(chunkDateRange('2026-10-01', '2026-10-30')).toEqual([
      { start: '2026-10-01', end: '2026-10-14' },
      { start: '2026-10-15', end: '2026-10-28' },
      { start: '2026-10-29', end: '2026-10-30' },
    ])
  })

  it('parses rollups, skipping unworn days, and converts weight to kg', () => {
    const civil = (day: number) => ({ date: { year: 2026, month: 11, day } })
    const steps = parseDailyRollup(
      {
        rollupDataPoints: [
          { civilStartTime: civil(15), steps: { countSum: '6801' } },
          { civilStartTime: civil(14) },
        ],
      },
      'steps',
    )
    expect(steps).toEqual({ '2026-11-15': 6801 })
    expect(
      parseDailyRollup({ rollupDataPoints: [{ civilStartTime: civil(15), totalCalories: { kcalSum: 2412.6 } }] }, 'totalCalories'),
    ).toEqual({ '2026-11-15': 2413 })
    expect(
      parseDailyRollup({ rollupDataPoints: [{ civilStartTime: civil(15), weight: { weightGramsAvg: 82350 } }] }, 'weight'),
    ).toEqual({ '2026-11-15': 82.4 })
  })

  it('maps exercise types and durations', () => {
    expect(mapExerciseType('RUNNING')).toBe('Run')
    expect(mapExerciseType('BIKING_STATIONARY')).toBe('Ride')
    expect(mapExerciseType('STRENGTH_TRAINING')).toBe('Workout')
    expect(mapExerciseType('PADDLEBOARDING')).toBe('Other')
    expect(parseDurationSeconds('1800s')).toBe(1800)
    expect(parseDurationSeconds('abc')).toBeNull()
  })

  it('maps an exercise data point using its own UTC offset for the date', () => {
    const w = mapExerciseDataPoint({
      name: 'users/me/dataTypes/exercise/dataPoints/abc',
      exercise: {
        interval: {
          startTime: '2026-11-15T04:30:00Z',
          startUtcOffset: '-25200s',
          endTime: '2026-11-15T05:10:00Z',
        },
        exerciseType: 'RUNNING',
        activeDuration: '2280s',
        metricsSummary: { caloriesKcal: 412.4, distanceMillimeters: 6200000, averageHeartRateBeatsPerMinute: 151.2 },
      },
    })
    expect(w).toMatchObject({
      externalId: 'users/me/dataTypes/exercise/dataPoints/abc',
      name: 'Running',
      activityType: 'Run',
      activityDate: '2026-11-14',
      movingTimeSeconds: 2280,
      distanceMeters: 6200,
      averageHeartrate: 151,
      calories: 412,
    })
    expect(mapExerciseDataPoint({ exercise: {} })).toBeNull()
  })

  it('builds the exercise filter and parses settings with defaults', () => {
    expect(exerciseFilter('2026-11-01', '2026-11-15')).toBe(
      'exercise.interval.civil_start_time >= "2026-11-01T00:00:00" AND exercise.interval.civil_start_time < "2026-11-16T00:00:00"',
    )
    expect(parseFitnessSyncSettings({ import_steps: false })).toEqual({
      importWorkouts: true,
      importCalories: true,
      importSteps: false,
      importWeight: true,
    })
  })
})
