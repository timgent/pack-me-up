import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { TripCountdownBadge } from './TripCountdownBadge'
import { formatTripCountdown } from '../create-packing-list/tripDetails'
import type { TripCountdownInput } from '../create-packing-list/tripDetails'

/** Renders the badge the way a page does: countdown built from the list. */
const renderFor = (trip: TripCountdownInput, remainingItems?: number) =>
    render(<TripCountdownBadge countdown={formatTripCountdown(trip, remainingItems)} />)

/** Freezes the clock mid-afternoon on 15 June 2026, local time. */
const freezeClock = () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 14, 30))
}

const badge = () => screen.queryByTestId('trip-countdown')

describe('the trip countdown badge', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('counts the sleeps until the trip, naming where it is going', () => {
        freezeClock()
        renderFor({ startDate: '2026-06-18', destination: 'Cornwall' })
        expect(badge()!.textContent).toContain('3 sleeps until Cornwall')
        expect(badge()!.getAttribute('data-countdown-status')).toBe('upcoming')
    })

    it('renders nothing at all for a list with no dates — not an empty badge', () => {
        freezeClock()
        const { container } = renderFor({ destination: 'Cornwall' })
        expect(badge()).toBeNull()
        expect(container.innerHTML).toBe('')
    })

    it('marks the day of the trip differently from the days before it', () => {
        freezeClock()
        const { unmount } = renderFor({ startDate: '2026-06-15', destination: 'Cornwall' })
        expect(badge()!.textContent).toContain('Off to Cornwall today!')
        expect(badge()!.getAttribute('data-countdown-status')).toBe('today')
        const dayOfClassName = badge()!.className
        unmount()

        renderFor({ startDate: '2026-06-25', destination: 'Cornwall' })
        expect(badge()!.className).not.toBe(dayOfClassName)
    })

    it('says the trip is under way rather than counting past zero', () => {
        freezeClock()
        renderFor({ startDate: '2026-06-10', endDate: '2026-06-20', destination: 'Cornwall' })
        expect(badge()!.textContent).toContain('In Cornwall now')
        expect(badge()!.getAttribute('data-countdown-status')).toBe('in-progress')
    })

    it('looks back on a trip that is over', () => {
        freezeClock()
        renderFor({ startDate: '2026-06-01', endDate: '2026-06-08', destination: 'Cornwall' })
        expect(badge()!.textContent).toContain('Back from Cornwall')
        expect(badge()!.getAttribute('data-countdown-status')).toBe('past')
    })

    it('carries the items still to pack when the trip is close', () => {
        freezeClock()
        renderFor({ startDate: '2026-06-17', destination: 'Cornwall' }, 18)
        expect(badge()!.textContent).toContain('2 sleeps until Cornwall · 18 items left')
    })

    it('leaves the emoji out of the accessible name so it is not read aloud', () => {
        freezeClock()
        renderFor({ startDate: '2026-06-18', destination: 'Cornwall' })
        expect(badge()!.querySelector('[aria-hidden="true"]')).not.toBeNull()
    })
})
