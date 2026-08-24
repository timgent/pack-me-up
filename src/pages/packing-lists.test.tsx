import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { PackingLists } from './packing-lists'
import type { PackingAppDatabase } from '../services/database'

vi.mock('../utils/uuid', () => ({
    generateUUID: vi.fn(() => 'new-uuid'),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>()
    return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(() => ({ showToast: vi.fn() })),
}))

vi.mock('../hooks/usePodErrorHandler', () => ({
    usePodErrorHandler: vi.fn(() => vi.fn()),
}))

vi.mock('../services/solidPod', () => ({
    getPrimaryPodUrl: vi.fn(),
    saveRdfToPod: vi.fn(),
    deleteFileFromPod: vi.fn(),
    getCollaborators: vi.fn().mockResolvedValue([]),
    isPubliclyAccessible: vi.fn().mockResolvedValue(false),
    friendlyPodName: vi.fn((url: string) => url),
    getPodOwnerName: vi.fn().mockResolvedValue(null),
    resolveOwnerDisplayName: vi.fn((_name: string | null, _webId: string | null, podUrl: string) => podUrl),
    buildSharedListPath: vi.fn((id: string, podUrl: string) => `/view-lists/${id}?pod=${podUrl}`),
    POD_CONTAINERS: { PACKING_LISTS: '/packing-lists/', DELETED_PACKING_LISTS: '/deleted-packing-lists.ttl' },
    POD_ERROR_MESSAGES: {
        NOT_LOGGED_IN: 'Not logged in',
        NOT_LOGGED_IN_LOAD: 'Not logged in to load',
        SAVE_FAILED: 'Save failed',
        LOAD_FAILED: 'Load failed',
        NO_DATA_FOUND: (type: string) => `No ${type} found`,
    },
}))

import type { AppSession as Session } from '../types/AppSession'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { getPrimaryPodUrl, saveRdfToPod, deleteFileFromPod } from '../services/solidPod'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockSaveRdfToPod = vi.mocked(saveRdfToPod)
const mockDeleteFileFromPod = vi.mocked(deleteFileFromPod)

const testPackingList = {
    id: 'list-1',
    name: 'Beach Trip',
    createdAt: '2026-01-01T00:00:00Z',
    items: [{ id: 'i1', itemText: 'Sunscreen', personName: 'Me', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false }],
}

const testList = {
    id: 'list-1',
    name: 'Summer Holiday',
    createdAt: '2026-01-01T00:00:00Z',
    items: [],
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

function makeDb() {
    return {
        getAllPackingLists: vi.fn().mockResolvedValue([testList]),
        deletePackingList: vi.fn().mockResolvedValue(undefined),
        getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
    }
}

function renderComponent() {
    return render(
        <MemoryRouter>
            <PackingLists />
        </MemoryRouter>
    )
}

/**
 * Open a card's kebab menu. Radix opens its menu on pointerdown, which
 * fireEvent.click does not send.
 */
function openCardMenu(listName = 'Summer Holiday') {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${listName}` }), { button: 0 })
    return screen.getByRole('menu')
}

/** Pick an action out of a card's kebab menu. */
function chooseCardAction(action: RegExp, listName = 'Summer Holiday') {
    fireEvent.click(within(openCardMenu(listName)).getByRole('menuitem', { name: action }))
}

describe('PackingLists', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn().mockResolvedValue([testPackingList]),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
                getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            } as unknown as PackingAppDatabase,
        })
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('uses the shared loading treatment while packing lists load', () => {
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn(() => new Promise(() => {})),
                getSharedListsWithMe: vi.fn(() => new Promise(() => {})),
            } as unknown as PackingAppDatabase,
        })

        renderComponent()

        expect(screen.getByRole('status').textContent).toContain('Loading packing lists...')
        expect(screen.getAllByTestId('loading-skeleton-card').length).toBeGreaterThan(0)
    })

    it('does not show Protect Your Packing Lists banner for non-logged-in users with lists', async () => {
        render(
            <MemoryRouter>
                <PackingLists />
            </MemoryRouter>
        )

        await waitFor(() => expect(screen.getByText(/Beach Trip/)).toBeTruthy())
        expect(screen.queryByText(/Protect Your Packing Lists/i)).toBeNull()
    })
})

describe('PackingLists progress bar minimum width', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('shows at least 4% width when a small number of items are packed', async () => {
        const items = Array.from({ length: 130 }, (_, i) => ({
            id: `item-${i}`,
            itemText: `Item ${i}`,
            personName: 'Me',
            personId: 'p1',
            questionId: 'q1',
            optionId: 'o1',
            packed: i === 0, // only 1 of 130 packed → 1%
        }))
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn().mockResolvedValue([{
                    id: 'list-1', name: 'Big List', createdAt: '2026-01-01T00:00:00Z', items,
                }]),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
                getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            } as unknown as PackingAppDatabase,
        })

        render(<MemoryRouter><PackingLists /></MemoryRouter>)

        await screen.findByText(/Big List/)

        const fill = document.querySelector('[data-testid="progress-fill"]') as HTMLElement
        expect(fill).not.toBeNull()
        const width = parseFloat(fill.style.width)
        expect(width).toBeGreaterThanOrEqual(4)
    })

    it('shows 0% width when no items are packed', async () => {
        const items = Array.from({ length: 10 }, (_, i) => ({
            id: `item-${i}`,
            itemText: `Item ${i}`,
            personName: 'Me',
            personId: 'p1',
            questionId: 'q1',
            optionId: 'o1',
            packed: false,
        }))
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn().mockResolvedValue([{
                    id: 'list-2', name: 'Empty Progress', createdAt: '2026-01-01T00:00:00Z', items,
                }]),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
                getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            } as unknown as PackingAppDatabase,
        })

        render(<MemoryRouter><PackingLists /></MemoryRouter>)

        await screen.findByText(/Empty Progress/)

        const fill = document.querySelector('[data-testid="progress-fill"]') as HTMLElement
        expect(fill).not.toBeNull()
        expect(fill.style.width).toBe('0%')
    })
})

describe('PackingLists delete confirmation', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('does not delete immediately when Delete is clicked', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/delete/i)

        expect(db.deletePackingList).not.toHaveBeenCalled()
    })

    it('shows a confirmation dialog with the list name when Delete is clicked', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/delete/i)

        await waitFor(() => {
            expect(screen.getByText(/cannot be undone/i)).toBeTruthy()
            expect(screen.getByText(/Summer Holiday/i, { selector: 'p' })).toBeTruthy()
        })
    })

    it('cancels deletion when Cancel is clicked in the dialog', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/delete/i)

        await waitFor(() => expect(screen.getByText(/cannot be undone/i)).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

        await waitFor(() => {
            expect(screen.queryByText(/cannot be undone/i)).toBeNull()
        })
        expect(db.deletePackingList).not.toHaveBeenCalled()
    })

    it('deletes the list when confirmed in the dialog', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/delete/i)

        await screen.findByText(/cannot be undone/i)

        fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

        await waitFor(() => {
            // The tombstone is the point: without it another device that still
            // holds this list uploads it back on its next login sync.
            expect(db.deletePackingList).toHaveBeenCalledWith('list-1', { recordDeletion: true })
        })
    })

    it('does not tombstone a list that is only a cached copy of a shared one', async () => {
        const db = makeDb()
        db.getAllPackingLists = vi.fn().mockResolvedValue([
            { ...testList, sharedFromPodUrl: 'https://someone-else.example/' },
        ])
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/delete/i)
        await screen.findByText(/cannot be undone/i)
        fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

        await waitFor(() => {
            expect(db.deletePackingList).toHaveBeenCalledWith('list-1', { recordDeletion: false })
        })
    })
})

describe('PackingLists rename', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it("offers Rename in each card's kebab menu", async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        expect(within(openCardMenu()).getByRole('menuitem', { name: /rename/i })).toBeTruthy()
    })

    it('opens a rename modal pre-filled with the current list name when Rename is clicked', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/rename/i)

        await waitFor(() => {
            const input = screen.getByRole('textbox')
            expect((input as HTMLInputElement).value).toBe('Summer Holiday')
        })
    })

    it('calls savePackingList with the new name when Save is clicked', async () => {
        const db = { ...makeDb(), savePackingList: vi.fn().mockResolvedValue({ rev: '2' }) }
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/rename/i)

        await waitFor(() => screen.getByRole('textbox'))

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Winter Holiday' } })
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

        await waitFor(() => {
            expect(db.savePackingList).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'list-1', name: 'Winter Holiday' })
            )
        })
    })

    it('does not call savePackingList when Cancel is clicked in the rename modal', async () => {
        const db = { ...makeDb(), savePackingList: vi.fn().mockResolvedValue({ rev: '2' }) }
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/rename/i)

        await waitFor(() => screen.getByRole('textbox'))

        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

        expect(db.savePackingList).not.toHaveBeenCalled()
    })
})

describe('PackingLists mobile layout', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it('action buttons container wraps on small screens (has flex-wrap class)', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
        renderComponent()
        await screen.findByText(/Summer Holiday/)
        const buttonsContainer = document.querySelector('[data-testid="list-actions"]')
        expect(buttonsContainer).not.toBeNull()
        expect(buttonsContainer!.className).toContain('flex-wrap')
    })
})

describe('PackingLists duplicate', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
    })

    it("offers Duplicate in each card's kebab menu", async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        expect(within(openCardMenu()).getByRole('menuitem', { name: /duplicate/i })).toBeTruthy()
    })

    it('calls savePackingList with a new list named "Copy of {name}" when Duplicate is clicked', async () => {
        const db = { ...makeDb(), savePackingList: vi.fn().mockResolvedValue({ rev: '1' }) }
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/duplicate/i)

        await waitFor(() => {
            expect(db.savePackingList).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Copy of Summer Holiday', id: 'new-uuid' })
            )
        })
    })
})

describe('PackingLists new list button', () => {
    beforeEach(() => {
        mockNavigate.mockClear()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn().mockResolvedValue([testList]),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
                getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            } as unknown as PackingAppDatabase,
        })
    })

    it('renders a New List button', async () => {
        renderComponent()
        await screen.findByText(/Summer Holiday/)
        expect(screen.getByRole('button', { name: /new list/i })).toBeTruthy()
    })

    it('navigates to /create-packing-list when New List is clicked', async () => {
        renderComponent()
        await screen.findByText(/Summer Holiday/)
        fireEvent.click(screen.getByRole('button', { name: /new list/i }))
        expect(mockNavigate).toHaveBeenCalledWith('/create-packing-list')
    })
})

describe('PackingLists pod sync on mutation', () => {
    const loggedInSession = { fetch: vi.fn() } as unknown as Session

    function makeDb() {
        return {
            getAllPackingLists: vi.fn().mockResolvedValue([testList]),
            deletePackingList: vi.fn().mockResolvedValue(undefined),
            savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
            getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
        }
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: loggedInSession,
            webId: 'https://timgent.solidcommunity.net/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockGetPrimaryPodUrl.mockResolvedValue('https://timgent.solidcommunity.net')
        mockSaveRdfToPod.mockResolvedValue(undefined)
        mockDeleteFileFromPod.mockResolvedValue(undefined)
    })

    it('saves renamed list to pod after rename is confirmed', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })

        renderComponent()
        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/rename/i)
        await waitFor(() => screen.getByRole('textbox'))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Winter Holiday' } })
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

        await waitFor(() => {
            expect(mockSaveRdfToPod).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileUrl: expect.stringContaining('list-1.ttl'),
                    data: expect.objectContaining({ id: 'list-1', name: 'Winter Holiday' }),
                })
            )
        })
    })

    it('saves duplicated list to pod after duplicate', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })

        renderComponent()
        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/duplicate/i)

        await waitFor(() => {
            expect(mockSaveRdfToPod).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileUrl: expect.stringContaining('.ttl'),
                    data: expect.objectContaining({ name: 'Copy of Summer Holiday' }),
                })
            )
        })
    })

    it('deletes list from pod after delete is confirmed', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })

        renderComponent()
        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/delete/i)
        await screen.findByText(/cannot be undone/i)
        fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

        await waitFor(() => {
            expect(mockDeleteFileFromPod).toHaveBeenCalledWith(
                loggedInSession,
                'https://timgent.solidcommunity.net/packing-lists/list-1.ttl'
            )
        })
    })

    it('does not call saveRdfToPod when not logged in', async () => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })

        renderComponent()
        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/duplicate/i)

        await waitFor(() => {
            expect(makeDb().savePackingList).toBeDefined()
        })
        expect(mockSaveRdfToPod).not.toHaveBeenCalled()
    })
})


describe('PackingLists trip destination and dates', () => {
    const tripStart = daysFromToday(30)
    const tripEnd = daysFromToday(37)

    const tripList = {
        id: 'list-1',
        name: 'Summer Holiday',
        createdAt: '2026-01-01T00:00:00Z',
        destination: 'Lisbon, Portugal',
        startDate: tripStart,
        endDate: tripEnd,
        items: [],
    }

    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderWithList(list: Record<string, unknown>) {
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn().mockResolvedValue([list]),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
                getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            } as unknown as PackingAppDatabase,
        })
        return renderComponent()
    }

    it('shows the destination on the list card', async () => {
        renderWithList({ ...tripList, startDate: undefined, endDate: undefined })
        expect(await screen.findByText(/📍 Lisbon, Portugal/)).toBeTruthy()
    })

    // Two lines both saying Lisbon is one line too many: once the trip has
    // dates the countdown names the destination, so the badge stands down.
    it('folds the destination into the countdown once the trip has dates', async () => {
        renderWithList(tripList)
        expect((await screen.findByTestId('trip-countdown')).textContent).toContain('Lisbon, Portugal')
        expect(screen.queryByText(/📍 Lisbon, Portugal/)).toBeNull()
    })

    it('shows the trip dates rather than the creation date', async () => {
        renderWithList(tripList)
        await screen.findByText(/Summer Holiday/)

        const expected = `${localDateOf(tripStart)} – ${localDateOf(tripEnd)}`
        expect(screen.getByText(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy()
        expect(screen.queryByText(/📅 Created/)).toBeNull()
    })

    it('labels the date as the creation date when the list has no trip dates', async () => {
        renderWithList({ ...tripList, startDate: undefined, endDate: undefined })
        await screen.findByText(/Summer Holiday/)

        expect(screen.getByText(/📅 Created/).textContent).toContain(new Date('2026-01-01T00:00:00Z').toLocaleDateString())
    })

    it('shows no destination badge when the list has none', async () => {
        renderWithList({ ...tripList, destination: undefined })
        await screen.findByText(/Summer Holiday/)

        expect(screen.queryByText(/📍/)).toBeNull()
    })
})

describe('PackingLists trip countdown', () => {
    const item = (id: string, packed: boolean) => ({
        id, itemText: id, personName: 'Me', personId: 'p1', questionId: 'q1', optionId: 'o1', packed,
    })

    const countdownList = (extra: Record<string, unknown>) => ({
        id: 'list-1',
        name: 'Summer Holiday',
        createdAt: '2026-01-01T00:00:00Z',
        destination: 'Cornwall',
        items: [item('a', false), item('b', false), item('c', true)],
        ...extra,
    })

    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderWithList(list: Record<string, unknown>) {
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn().mockResolvedValue([list]),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
                getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            } as unknown as PackingAppDatabase,
        })
        return renderComponent()
    }

    it('counts the sleeps until a trip that is still to come', async () => {
        renderWithList(countdownList({ startDate: daysFromToday(30), endDate: daysFromToday(37) }))
        expect((await screen.findByTestId('trip-countdown')).textContent).toContain('30 sleeps until Cornwall')
    })

    it('carries the items still to pack once the trip is days away', async () => {
        renderWithList(countdownList({ startDate: daysFromToday(2), endDate: daysFromToday(9) }))
        expect((await screen.findByTestId('trip-countdown')).textContent)
            .toContain('2 sleeps until Cornwall · 2 items left')
    })

    it('celebrates the day of the trip rather than showing zero sleeps', async () => {
        renderWithList(countdownList({ startDate: daysFromToday(0), endDate: daysFromToday(7) }))
        const countdown = await screen.findByTestId('trip-countdown')
        expect(countdown.textContent).toContain('Off to Cornwall today!')
        expect(countdown.textContent).not.toContain('0 sleeps')
    })

    it('says the trip is under way once it has started', async () => {
        renderWithList(countdownList({ startDate: daysFromToday(-2), endDate: daysFromToday(5) }))
        const countdown = await screen.findByTestId('trip-countdown')
        expect(countdown.textContent).toContain('In Cornwall now')
        expect(countdown.textContent).not.toContain('-')
    })

    it('never counts backwards for a trip that is over', async () => {
        renderWithList(countdownList({ startDate: daysFromToday(-9), endDate: daysFromToday(-2) }))
        // Finished trips are folded away, so open the section they fold into.
        fireEvent.click(await screen.findByRole('button', { name: /Past trips/i }))
        const countdown = await screen.findByTestId('trip-countdown')
        expect(countdown.textContent).toContain('Back from Cornwall')
        expect(countdown.textContent).not.toContain('-')
    })

    it('leaves a list with no dates without a countdown or a gap where one would be', async () => {
        renderWithList(countdownList({}))
        await screen.findByText(/Summer Holiday/)
        expect(screen.queryByTestId('trip-countdown')).toBeNull()
    })
})

describe('PackingLists during the login pod sync', () => {
    const loggedInSession = { fetch: vi.fn() } as unknown as Session

    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: loggedInSession,
            webId: 'https://timgent.solidcommunity.net/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        } as unknown as ReturnType<typeof useSolidPod>)
        mockGetPrimaryPodUrl.mockResolvedValue('https://timgent.solidcommunity.net')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderSyncing(lists: Record<string, unknown>[], loginSyncInProgress: boolean) {
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn().mockResolvedValue(lists),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
                getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            } as unknown as PackingAppDatabase,
            loginSyncVersion: 0,
            loginSyncInProgress,
        })
        return renderComponent()
    }

    it('shows locally stored lists without waiting for the pod sync to finish', async () => {
        renderSyncing([testPackingList], true)

        expect(await screen.findByText(/Beach Trip/)).toBeTruthy()
        expect(screen.queryByText('Loading packing lists...')).toBeNull()
    })

    it('flags that a pod sync is still running', async () => {
        renderSyncing([testPackingList], true)

        await screen.findByText(/Beach Trip/)
        expect(screen.getByTestId('pod-sync-indicator')).toBeTruthy()
    })

    it('drops the indicator once the pod sync has finished', async () => {
        renderSyncing([testPackingList], false)

        await screen.findByText(/Beach Trip/)
        expect(screen.queryByTestId('pod-sync-indicator')).toBeNull()
    })

    it('keeps waiting rather than claiming there are no lists while a fresh device is still filling up', async () => {
        renderSyncing([], true)

        await waitFor(() => {
            expect(screen.getByRole('status').textContent).toContain('Loading packing lists...')
        })
        expect(screen.queryByText(/No packing lists found/i)).toBeNull()
    })

    it('reports an empty pod once the sync has finished', async () => {
        renderSyncing([], false)

        await waitFor(() => expect(screen.getByText(/No packing lists found/i)).toBeTruthy())
    })
})

describe('PackingLists sync-across-devices prompt', () => {
    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        } as unknown as ReturnType<typeof useSolidPod>)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderWithLists(lists: Record<string, unknown>[]) {
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn().mockResolvedValue(lists),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
                getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            } as unknown as PackingAppDatabase,
        })
        return renderComponent()
    }

    it('nudges a logged-out user with a list to sync across devices', async () => {
        renderWithLists([testPackingList])

        expect(await screen.findByTestId('sync-across-devices-prompt')).toBeTruthy()
    })

    it('does not nudge before there is anything to sync', async () => {
        renderWithLists([])

        await waitFor(() => expect(screen.getByText(/No packing lists found/i)).toBeTruthy())
        expect(screen.queryByTestId('sync-across-devices-prompt')).toBeNull()
    })

    it('does not nudge a user who is already logged in', async () => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: { fetch: vi.fn(), info: { isLoggedIn: true, webId: 'https://me.example/profile#me' } },
            webId: 'https://me.example/profile#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        } as unknown as ReturnType<typeof useSolidPod>)
        mockGetPrimaryPodUrl.mockResolvedValue('https://pod.example/')

        renderWithLists([testPackingList])

        await waitFor(() => expect(screen.getByText(/Beach Trip/)).toBeTruthy())
        expect(screen.queryByTestId('sync-across-devices-prompt')).toBeNull()
    })

    it('stays dismissed for the rest of the session', async () => {
        renderWithLists([testPackingList])

        fireEvent.click(await screen.findByLabelText('Dismiss sync prompt'))

        expect(screen.queryByTestId('sync-across-devices-prompt')).toBeNull()
    })
})

describe('PackingLists past trips', () => {
    const listWithDates = (
        id: string,
        name: string,
        startDate?: string,
        endDate?: string,
    ) => ({ id, name, createdAt: '2026-01-01T00:00:00Z', items: [], startDate, endDate })

    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        } as unknown as ReturnType<typeof useSolidPod>)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderWithLists(lists: Record<string, unknown>[]) {
        mockUseDatabase.mockReturnValue({
            db: {
                getAllPackingLists: vi.fn().mockResolvedValue(lists),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
                getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            } as unknown as PackingAppDatabase,
        })
        return renderComponent()
    }

    const pastTripsToggle = () => screen.getByRole('button', { name: /Past trips/ })

    it('folds finished trips away behind a collapsed section, counted', async () => {
        renderWithLists([
            listWithDates('l1', 'Next Summer', daysFromToday(30), daysFromToday(37)),
            listWithDates('l2', 'Last Winter', daysFromToday(-60), daysFromToday(-53)),
            listWithDates('l3', 'Last Spring', daysFromToday(-20), daysFromToday(-14)),
        ])

        expect(await screen.findByText(/Next Summer/)).toBeTruthy()
        expect(pastTripsToggle().textContent).toContain('Past trips (2)')
        expect(pastTripsToggle().getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText(/Last Winter/)).toBeNull()
        expect(screen.queryByText(/Last Spring/)).toBeNull()
    })

    it('reveals and folds the past trips again as the section is toggled', async () => {
        renderWithLists([
            listWithDates('l1', 'Next Summer', daysFromToday(30), daysFromToday(37)),
            listWithDates('l2', 'Last Winter', daysFromToday(-60), daysFromToday(-53)),
        ])

        await screen.findByText(/Next Summer/)

        fireEvent.click(pastTripsToggle())
        expect(pastTripsToggle().getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByText(/Last Winter/)).toBeTruthy()

        fireEvent.click(pastTripsToggle())
        expect(pastTripsToggle().getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText(/Last Winter/)).toBeNull()
    })

    it('treats a trip that ends today as still current', async () => {
        renderWithLists([listWithDates('l1', 'Ends Today', daysFromToday(-5), daysFromToday(0))])

        expect(await screen.findByText(/Ends Today/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Past trips/ })).toBeNull()
    })

    it('keeps a list with no dates in the current section', async () => {
        renderWithLists([
            listWithDates('l1', 'Someday Trip'),
            listWithDates('l2', 'Last Winter', daysFromToday(-60), daysFromToday(-53)),
        ])

        expect(await screen.findByText(/Someday Trip/)).toBeTruthy()
        expect(pastTripsToggle().textContent).toContain('Past trips (1)')
    })

    it('shows no past trips section when every trip is still to come', async () => {
        renderWithLists([listWithDates('l1', 'Next Summer', daysFromToday(30), daysFromToday(37))])

        await screen.findByText(/Next Summer/)
        expect(screen.queryByRole('button', { name: /Past trips/ })).toBeNull()
    })

    it('carries the gradient rotation on across the current/past boundary', async () => {
        renderWithLists([
            listWithDates('l1', 'Next Summer', daysFromToday(30), daysFromToday(37)),
            listWithDates('l2', 'Last Winter', daysFromToday(-60), daysFromToday(-53)),
        ])

        await screen.findByText(/Next Summer/)
        fireEvent.click(pastTripsToggle())

        const [current, past] = screen.getAllByTestId('packing-list-card')
        expect(current.className).not.toBe(past.className)
    })

    it('keeps only the three most recently worked on undated lists in view', async () => {
        const undated = (id: string, name: string, touchedDaysAgo: number) => ({
            id,
            name,
            createdAt: '2026-01-01T00:00:00Z',
            lastModified: new Date(Date.now() - touchedDaysAgo * 86_400_000).toISOString(),
            items: [],
        })

        renderWithLists([
            undated('l1', 'Touched today', 0),
            undated('l2', 'Touched yesterday', 1),
            undated('l3', 'Touched last week', 7),
            undated('l4', 'Touched last month', 30),
            undated('l5', 'Touched ages ago', 200),
        ])

        await screen.findByText(/Touched today/)
        expect(screen.getByText(/Touched yesterday/)).toBeTruthy()
        expect(screen.getByText(/Touched last week/)).toBeTruthy()
        expect(screen.queryByText(/Touched last month/)).toBeNull()
        expect(screen.queryByText(/Touched ages ago/)).toBeNull()
    })

    // "Past trips" would be a lie about a list folded for going quiet.
    it('calls the folded section "Older trips" when it holds an undated list', async () => {
        const undated = (id: string, name: string, touchedDaysAgo: number) => ({
            id,
            name,
            createdAt: '2026-01-01T00:00:00Z',
            lastModified: new Date(Date.now() - touchedDaysAgo * 86_400_000).toISOString(),
            items: [],
        })

        renderWithLists([
            undated('l1', 'A', 1),
            undated('l2', 'B', 2),
            undated('l3', 'C', 3),
            undated('l4', 'D', 4),
        ])

        await screen.findByText(/A/)
        expect(screen.getByRole('button', { name: /Older trips \(1\)/ })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Past trips/ })).toBeNull()
    })

    it('never folds a trip that is still ahead, however many there are', async () => {
        renderWithLists(
            Array.from({ length: 6 }, (_, i) =>
                listWithDates(`l${i}`, `Trip ${i}`, daysFromToday(10 + i * 7), daysFromToday(14 + i * 7)))
        )

        await screen.findByText(/Trip 0/)
        expect(screen.getByText(/Trip 5/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /trips/i })).toBeNull()
    })

    it('says why the main section is empty when only past trips are left', async () => {
        renderWithLists([listWithDates('l1', 'Last Winter', daysFromToday(-60), daysFromToday(-53))])

        expect(await screen.findByText(/No upcoming trips/i)).toBeTruthy()
        expect(screen.queryByText(/No packing lists found/i)).toBeNull()
    })
})

describe('PackingLists card actions menu', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
        mockNavigate.mockClear()
    })

    it('opens the list when the card body is clicked', async () => {
        renderComponent()

        await screen.findByText(/Summer Holiday/)

        fireEvent.click(screen.getByTestId('packing-list-card'))

        expect(mockNavigate).toHaveBeenCalledWith('/view-lists/list-1')
    })

    it('opens the shared list when a cached copy of someone else’s card is clicked', async () => {
        const db = makeDb()
        db.getAllPackingLists = vi.fn().mockResolvedValue([
            { ...testList, sharedFromPodUrl: 'https://someone-else.example/' },
        ])
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        fireEvent.click(screen.getByTestId('packing-list-card'))

        expect(mockNavigate).toHaveBeenCalledWith('/view-lists/list-1?pod=https://someone-else.example/')
    })

    it('does not open the list when the kebab is clicked', async () => {
        renderComponent()

        await screen.findByText(/Summer Holiday/)

        const kebab = screen.getByRole('button', { name: 'More actions for Summer Holiday' })
        fireEvent.pointerDown(kebab, { button: 0 })
        fireEvent.click(kebab)

        expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('gathers Rename, Duplicate and Delete behind the kebab', async () => {
        renderComponent()

        await screen.findByText(/Summer Holiday/)

        const menu = openCardMenu()
        expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual([
            'Rename', 'Duplicate', 'Delete',
        ])
    })

    it('leaves no action buttons loose on the card', async () => {
        renderComponent()

        await screen.findByText(/Summer Holiday/)

        const card = screen.getByTestId('packing-list-card')
        expect(within(card).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([
            'More actions for Summer Holiday',
        ])
    })

    it('closes the menu on Escape without opening the list', async () => {
        renderComponent()

        await screen.findByText(/Summer Holiday/)

        openCardMenu()
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
        expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('does not open the list when an action is chosen from the menu', async () => {
        const db = { ...makeDb(), savePackingList: vi.fn().mockResolvedValue({ rev: '1' }) }
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        chooseCardAction(/duplicate/i)

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        expect(mockNavigate).not.toHaveBeenCalled()
    })
})
