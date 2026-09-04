import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { AppSession as Session } from '../types/AppSession'

vi.mock('../components/SolidPodContext', () => ({ useSolidPod: vi.fn() }))
vi.mock('../components/ForeignPodContext', () => ({ useForeignPod: vi.fn() }))

vi.mock('../services/solidPod', () => ({
    loadMultipleRdfFromPod: vi.fn(),
    POD_CONTAINERS: { PACKING_LISTS: 'pack-me-up/packing-lists/' },
}))

vi.mock('../services/rdfSerialization', () => ({
    datasetToPackingList: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>()
    return { ...actual, useNavigate: () => mockNavigate }
})

import { ForeignPackingListsPage } from './foreign-packing-lists'
import { useSolidPod } from '../components/SolidPodContext'
import { useForeignPod } from '../components/ForeignPodContext'
import { loadMultipleRdfFromPod } from '../services/solidPod'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockUseForeignPod = vi.mocked(useForeignPod)
const mockLoadMultipleRdfFromPod = vi.mocked(loadMultipleRdfFromPod)

function renderPage() {
    return render(
        <MemoryRouter>
            <ForeignPackingListsPage />
        </MemoryRouter>
    )
}

/**
 * A YYYY-MM-DD date the given number of days either side of today. Trip dates
 * in fixtures have to move with the clock: a hard-coded date would quietly slip
 * into the past and land the list in the "Past trips" section instead.
 */
const daysFromToday = (days: number) => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The same YYYY-MM-DD date as the page renders it, in the viewer's locale. */
const localDateOf = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString()
}

describe('ForeignPackingListsPage loading state', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: {} as Session,
            webId: 'https://me.example/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseForeignPod.mockReturnValue({ foreignPodUrl: 'https://friend.example/' } as ReturnType<typeof useForeignPod>)
    })

    afterEach(() => {
        cleanup()
    })

    it('uses the shared loading treatment while the shared lists load', async () => {
        mockLoadMultipleRdfFromPod.mockReturnValue(new Promise(() => {}))

        renderPage()

        await waitFor(() => {
            expect(screen.getByRole('status').textContent).toContain('Loading packing lists...')
        })
        expect(screen.getAllByTestId('loading-skeleton-card').length).toBeGreaterThan(0)
    })

    it('replaces the loading treatment with the real content once the lists arrive', async () => {
        mockLoadMultipleRdfFromPod.mockResolvedValue({ data: [], errors: [] })

        renderPage()

        await waitFor(() => expect(screen.getByText(/no packing lists/i)).toBeTruthy())
        expect(screen.queryByRole('status')).toBeNull()
    })
})

describe('ForeignPackingListsPage trip destination and dates', () => {
    const tripStart = daysFromToday(30)
    const tripEnd = daysFromToday(37)

    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: {} as Session,
            webId: 'https://me.example/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseForeignPod.mockReturnValue({ foreignPodUrl: 'https://friend.example/' } as ReturnType<typeof useForeignPod>)
    })

    afterEach(() => {
        cleanup()
    })

    it('shows the destination and trip dates on a shared list', async () => {
        mockLoadMultipleRdfFromPod.mockResolvedValue({
            data: [{
                id: 'list-1',
                name: 'Summer Holiday',
                createdAt: '2026-01-01T00:00:00Z',
                destination: 'Lisbon, Portugal',
                startDate: tripStart,
                endDate: tripEnd,
                items: [],
            }],
            errors: [],
        })

        renderPage()

        await screen.findByText(/Summer Holiday/)
        expect(screen.getByText(/Lisbon, Portugal/)).toBeTruthy()
        expect(screen.getByText(new RegExp(localDateOf(tripStart).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy()
        expect(screen.queryByText(/Created/)).toBeNull()
    })

    it('falls back to a labelled creation date when a shared list has no trip dates', async () => {
        mockLoadMultipleRdfFromPod.mockResolvedValue({
            data: [{ id: 'list-1', name: 'Summer Holiday', createdAt: '2026-01-01T00:00:00Z', items: [] }],
            errors: [],
        })

        renderPage()

        await screen.findByText(/Summer Holiday/)
        expect(screen.getByText(/Created/)).toBeTruthy()
    })
})

describe('ForeignPackingListsPage past trips', () => {
    const sharedList = (id: string, name: string, startDate?: string, endDate?: string) =>
        ({ id, name, createdAt: '2026-01-01T00:00:00Z', items: [], startDate, endDate })

    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: {} as Session,
            webId: 'https://me.example/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseForeignPod.mockReturnValue({ foreignPodUrl: 'https://friend.example/' } as ReturnType<typeof useForeignPod>)
    })

    afterEach(() => {
        cleanup()
    })

    const pastTripsToggle = () => screen.getByRole('button', { name: /Past trips/ })

    it('folds a friend\'s finished trips away behind a collapsed section', async () => {
        mockLoadMultipleRdfFromPod.mockResolvedValue({
            data: [
                sharedList('l1', 'Next Summer', daysFromToday(30), daysFromToday(37)),
                sharedList('l2', 'Last Winter', daysFromToday(-60), daysFromToday(-53)),
            ],
            errors: [],
        })

        renderPage()

        await screen.findByText(/Next Summer/)
        expect(pastTripsToggle().textContent).toContain('Past trips (1)')
        expect(screen.queryByText(/Last Winter/)).toBeNull()

        fireEvent.click(pastTripsToggle())
        expect(screen.getByText(/Last Winter/)).toBeTruthy()
    })

    it('leaves an undated shared list in the current section', async () => {
        mockLoadMultipleRdfFromPod.mockResolvedValue({
            data: [sharedList('l1', 'Someday Trip')],
            errors: [],
        })

        renderPage()

        expect(await screen.findByText(/Someday Trip/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Past trips/ })).toBeNull()
    })

    it('carries the gradient rotation on across the current/past boundary', async () => {
        mockLoadMultipleRdfFromPod.mockResolvedValue({
            data: [
                sharedList('l1', 'Next Summer', daysFromToday(30), daysFromToday(37)),
                sharedList('l2', 'Last Winter', daysFromToday(-60), daysFromToday(-53)),
            ],
            errors: [],
        })

        renderPage()

        await screen.findByText(/Next Summer/)
        fireEvent.click(pastTripsToggle())

        const [current, past] = screen.getAllByTestId('shared-list-card')
        expect(current.className).not.toBe(past.className)
    })
})

// The nav no longer carries "Create List" (#302), so this page is the only
// create-list entry point in foreign-pod context — it did not have one before.
describe('ForeignPackingListsPage create entry point', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: {} as Session,
            webId: 'https://me.example/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseForeignPod.mockReturnValue({ foreignPodUrl: 'https://friend.example/' } as ReturnType<typeof useForeignPod>)
    })

    afterEach(() => {
        cleanup()
    })

    it('offers a New List button while the shared lists are still loading', async () => {
        mockLoadMultipleRdfFromPod.mockReturnValue(new Promise(() => {}))

        renderPage()

        await waitFor(() => expect(screen.getByRole('button', { name: /New List/i })).toBeTruthy())
    })

    it('creates the list into the pod being viewed, not your own', async () => {
        mockLoadMultipleRdfFromPod.mockResolvedValue({ data: [], errors: [] })

        renderPage()

        fireEvent.click(await screen.findByRole('button', { name: /New List/i }))

        expect(mockNavigate).toHaveBeenCalledWith(
            `/pod/${encodeURIComponent('https://friend.example/')}/create-packing-list`
        )
    })
})
