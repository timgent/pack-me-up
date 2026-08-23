import { describe, it, expect, afterEach, vi } from 'vitest'
import { formatTripDate, formatTripDates, tripDatesOutOfOrder, tripIsPast } from './tripDetails'

describe('formatTripDate', () => {
    it('formats a YYYY-MM-DD string as a local calendar date', () => {
        expect(formatTripDate('2026-07-12')).toBe(new Date(2026, 6, 12).toLocaleDateString())
    })

    it('does not shift the day for dates that would cross a UTC boundary', () => {
        // Parsed as UTC midnight this would render as the 31st in any negative offset
        expect(formatTripDate('2026-01-01')).toBe(new Date(2026, 0, 1).toLocaleDateString())
    })

    it('returns null for an empty or malformed value', () => {
        expect(formatTripDate('')).toBeNull()
        expect(formatTripDate('not-a-date')).toBeNull()
        expect(formatTripDate(undefined)).toBeNull()
    })
})

describe('formatTripDates', () => {
    const d = (y: number, m: number, day: number) => new Date(y, m, day).toLocaleDateString()

    it('returns null when neither date is set', () => {
        expect(formatTripDates(undefined, undefined)).toBeNull()
    })

    it('joins a start and end date with an en dash', () => {
        expect(formatTripDates('2026-07-12', '2026-07-19')).toBe(`${d(2026, 6, 12)} – ${d(2026, 6, 19)}`)
    })

    it('shows a single date when start and end are the same day', () => {
        expect(formatTripDates('2026-07-12', '2026-07-12')).toBe(d(2026, 6, 12))
    })

    it('prefixes a lone start date with "From"', () => {
        expect(formatTripDates('2026-07-12', undefined)).toBe(`From ${d(2026, 6, 12)}`)
    })

    it('prefixes a lone end date with "Until"', () => {
        expect(formatTripDates(undefined, '2026-07-19')).toBe(`Until ${d(2026, 6, 19)}`)
    })

    it('ignores an unparseable date', () => {
        expect(formatTripDates('nonsense', '2026-07-19')).toBe(`Until ${d(2026, 6, 19)}`)
    })
})

describe('tripDatesOutOfOrder', () => {
    it('is false when either date is missing', () => {
        expect(tripDatesOutOfOrder(undefined, '2026-07-19')).toBe(false)
        expect(tripDatesOutOfOrder('2026-07-12', undefined)).toBe(false)
        expect(tripDatesOutOfOrder(undefined, undefined)).toBe(false)
    })

    it('is false when the end date is on or after the start date', () => {
        expect(tripDatesOutOfOrder('2026-07-12', '2026-07-19')).toBe(false)
        expect(tripDatesOutOfOrder('2026-07-12', '2026-07-12')).toBe(false)
    })

    it('is true when the end date is before the start date', () => {
        expect(tripDatesOutOfOrder('2026-07-19', '2026-07-12')).toBe(true)
    })
})

describe('tripIsPast', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    /** Freezes the clock mid-afternoon on 15 June 2026, local time. */
    const freezeClock = () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 5, 15, 14, 30))
    }

    it('is true when the end date has been and gone', () => {
        freezeClock()
        expect(tripIsPast('2026-06-01', '2026-06-08')).toBe(true)
    })

    it('is true when a trip with no end date started before today', () => {
        freezeClock()
        expect(tripIsPast('2026-06-01', undefined)).toBe(true)
    })

    it('is false when the trip is still running — it ends today or later', () => {
        freezeClock()
        expect(tripIsPast('2026-06-01', '2026-06-15')).toBe(false)
        expect(tripIsPast('2026-06-01', '2026-06-20')).toBe(false)
    })

    it('is false for a trip still to come', () => {
        freezeClock()
        expect(tripIsPast('2026-07-12', '2026-07-19')).toBe(false)
        expect(tripIsPast('2026-07-12', undefined)).toBe(false)
        expect(tripIsPast(undefined, '2026-07-19')).toBe(false)
    })

    it('is false on the day the trip ends, whatever the time of day', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 5, 15, 23, 59))
        expect(tripIsPast('2026-06-10', '2026-06-15')).toBe(false)
    })

    // A list with no dates is never past — it stays where the traveller can see it.
    it('is false when the list has no dates at all', () => {
        freezeClock()
        expect(tripIsPast(undefined, undefined)).toBe(false)
    })

    it('is false when the only date present is unparseable', () => {
        freezeClock()
        expect(tripIsPast('nonsense', undefined)).toBe(false)
    })

    it('falls back to the start date when the end date is unparseable', () => {
        freezeClock()
        expect(tripIsPast('2026-06-01', 'nonsense')).toBe(true)
    })
})
