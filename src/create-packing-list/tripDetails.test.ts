import { describe, it, expect, afterEach, vi } from 'vitest'
import {
    formatTripDate,
    formatTripDates,
    tripDatesOutOfOrder,
    tripIsPast,
    splitCurrentAndPastTrips,
    MAX_UNDATED_CURRENT_TRIPS,
    formatTripCountdown,
} from './tripDetails'

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

describe('splitCurrentAndPastTrips', () => {
    /** A YYYY-MM-DD date the given number of days either side of today. */
    const daysFromToday = (days: number) => {
        const date = new Date()
        date.setDate(date.getDate() + days)
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    /** An ISO timestamp the given number of days ago. */
    const agoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

    const dated = (name: string, startDate: string, endDate?: string) =>
        ({ name, createdAt: agoIso(200), startDate, endDate })

    const undated = (name: string, touchedDaysAgo: number) =>
        ({ name, createdAt: agoIso(300), lastModified: agoIso(touchedDaysAgo) })

    const names = (lists: Array<{ name: string }>) => lists.map(list => list.name)

    it('folds a trip whose dates have passed', () => {
        const { current, past } = splitCurrentAndPastTrips([
            dated('Last Winter', daysFromToday(-60), daysFromToday(-53)),
            dated('Next Summer', daysFromToday(30), daysFromToday(37)),
        ])

        expect(names(current)).toEqual(['Next Summer'])
        expect(names(past)).toEqual(['Last Winter'])
    })

    it('never caps trips that are still ahead, however many there are', () => {
        const upcoming = Array.from({ length: 6 }, (_, i) =>
            dated(`Trip ${i}`, daysFromToday(10 + i * 7)))

        const { current, past } = splitCurrentAndPastTrips(upcoming)

        expect(current).toHaveLength(6)
        expect(past).toHaveLength(0)
    })

    it(`keeps only the ${MAX_UNDATED_CURRENT_TRIPS} most recently worked on undated lists`, () => {
        const { current, past } = splitCurrentAndPastTrips([
            undated('Touched ages ago', 90),
            undated('Touched today', 0),
            undated('Touched last week', 7),
            undated('Touched last month', 30),
            undated('Touched yesterday', 1),
        ])

        expect(names(current)).toEqual(['Touched today', 'Touched last week', 'Touched yesterday'])
        expect(names(past)).toEqual(['Touched ages ago', 'Touched last month'])
    })

    it('ranks an undated list on its creation date when it has never been modified', () => {
        const { current, past } = splitCurrentAndPastTrips([
            { name: 'Made today', createdAt: agoIso(0) },
            { name: 'Made a year ago', createdAt: agoIso(365) },
            { name: 'Made last week', createdAt: agoIso(7) },
            { name: 'Made last month', createdAt: agoIso(30) },
        ])

        expect(names(current)).toEqual(['Made today', 'Made last week', 'Made last month'])
        expect(names(past)).toEqual(['Made a year ago'])
    })

    it('prefers a recent edit over a recent creation', () => {
        const { current, past } = splitCurrentAndPastTrips([
            { name: 'Old but edited yesterday', createdAt: agoIso(200), lastModified: agoIso(1) },
            undated('A', 3),
            undated('B', 4),
            undated('C', 5),
        ])

        expect(names(current)).toEqual(['Old but edited yesterday', 'A', 'B'])
        expect(names(past)).toEqual(['C'])
    })

    it('leaves every undated list current when there are few enough', () => {
        const { current, past } = splitCurrentAndPastTrips([undated('A', 10), undated('B', 400)])

        expect(names(current)).toEqual(['A', 'B'])
        expect(past).toHaveLength(0)
    })

    it('keeps each section in the order the lists arrived, not in ranked order', () => {
        const { current } = splitCurrentAndPastTrips([
            undated('Touched last week', 7),
            undated('Touched today', 0),
            undated('Touched yesterday', 1),
        ])

        expect(names(current)).toEqual(['Touched last week', 'Touched today', 'Touched yesterday'])
    })

    it('reports the folded lists as all finished when only past-dated trips folded', () => {
        const { allPastFinished } = splitCurrentAndPastTrips([
            dated('Last Winter', daysFromToday(-60), daysFromToday(-53)),
            undated('Still around', 5),
        ])

        expect(allPastFinished).toBe(true)
    })

    it('reports the folded lists as not all finished once an undated list is folded', () => {
        const { allPastFinished } = splitCurrentAndPastTrips([
            undated('A', 1),
            undated('B', 2),
            undated('C', 3),
            undated('D', 4),
        ])

        expect(allPastFinished).toBe(false)
    })

    it('handles an empty list', () => {
        expect(splitCurrentAndPastTrips([])).toEqual({ current: [], past: [], allPastFinished: true })
    })
})

describe('formatTripCountdown', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    /** Freezes the clock mid-afternoon on 15 June 2026, local time. */
    const freezeClock = () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 5, 15, 14, 30))
    }

    it('returns null when the list has no dates at all', () => {
        freezeClock()
        expect(formatTripCountdown({ destination: 'Cornwall' })).toBeNull()
    })

    it('returns null when the only date present is unparseable', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: 'not-a-date' })).toBeNull()
    })

    it('counts the sleeps until a trip still to come, naming the destination', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-06-18', destination: 'Cornwall' })).toEqual({
            status: 'upcoming',
            sleeps: 3,
            label: '3 sleeps until Cornwall',
        })
    })

    it('counts sleeps without a destination when the list has none', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-06-25' })).toEqual({
            status: 'upcoming',
            sleeps: 10,
            label: '10 sleeps to go',
        })
    })

    it('says one sleep rather than 1 sleeps the night before', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-06-16', destination: 'Cornwall' })?.label)
            .toBe('1 sleep until Cornwall')
    })

    it('counts calendar days, not 24-hour blocks, late in the evening', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 5, 15, 23, 59))
        expect(formatTripCountdown({ startDate: '2026-06-16' })?.sleeps).toBe(1)
    })

    it('celebrates the day the trip starts instead of counting zero sleeps', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-06-15', endDate: '2026-06-20', destination: 'Cornwall' })).toEqual({
            status: 'today',
            sleeps: 0,
            label: 'Off to Cornwall today!',
        })
        expect(formatTripCountdown({ startDate: '2026-06-15' })?.label).toBe("Today's the day!")
    })

    it('says the trip is under way once it has started', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-06-10', endDate: '2026-06-20', destination: 'Cornwall' })).toEqual({
            status: 'in-progress',
            label: 'In Cornwall now',
        })
        expect(formatTripCountdown({ startDate: '2026-06-10', endDate: '2026-06-15' })?.label)
            .toBe('Trip in progress')
    })

    it('never counts backwards for a trip that is over', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-06-01', endDate: '2026-06-08', destination: 'Cornwall' })).toEqual({
            status: 'past',
            label: 'Back from Cornwall',
        })
        expect(formatTripCountdown({ startDate: '2026-06-01', endDate: '2026-06-08' })?.label)
            .toBe('Trip finished')
    })

    it('treats an end-date-only trip as past once that date has gone', () => {
        freezeClock()
        expect(formatTripCountdown({ endDate: '2026-06-08' })?.status).toBe('past')
    })

    it('has nothing to count down to when only a future end date is known', () => {
        freezeClock()
        expect(formatTripCountdown({ endDate: '2026-06-20' })).toBeNull()
    })

    it('adds the items still to pack once the trip is close enough to matter', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-06-17', destination: 'Cornwall' }, 18)?.label)
            .toBe('2 sleeps until Cornwall · 18 items left')
        expect(formatTripCountdown({ startDate: '2026-06-15' }, 1)?.label)
            .toBe("Today's the day! 1 item left")
    })

    it('leaves a distant trip uncluttered by the items count', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-07-12', destination: 'Cornwall' }, 18)?.label)
            .toBe('27 sleeps until Cornwall')
    })

    it('says nothing about items when there are none left to pack', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-06-16', destination: 'Cornwall' }, 0)?.label)
            .toBe('1 sleep until Cornwall')
    })

    it('does not nag about items on a trip already under way or over', () => {
        freezeClock()
        expect(formatTripCountdown({ startDate: '2026-06-10', endDate: '2026-06-20' }, 5)?.label)
            .toBe('Trip in progress')
        expect(formatTripCountdown({ startDate: '2026-06-01', endDate: '2026-06-08' }, 5)?.label)
            .toBe('Trip finished')
    })
})
