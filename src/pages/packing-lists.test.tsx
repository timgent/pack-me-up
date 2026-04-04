import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { PackingLists } from './packing-lists'
import type { PackingAppDatabase } from '../services/database'

vi.mock('../utils/uuid', () => ({
    generateUUID: vi.fn(() => 'new-uuid'),
}))

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
    saveMultipleFilesToPod: vi.fn(),
    saveFileToPod: vi.fn(),
    loadMultipleFilesFromPod: vi.fn(),
    deleteFileFromPod: vi.fn(),
    POD_CONTAINERS: { PACKING_LISTS: '/packing-lists/' },
    POD_ERROR_MESSAGES: {
        NOT_LOGGED_IN: 'Not logged in',
        NOT_LOGGED_IN_LOAD: 'Not logged in to load',
        SAVE_FAILED: 'Save failed',
        LOAD_FAILED: 'Load failed',
        NO_DATA_FOUND: (type: string) => `No ${type} found`,
    },
}))

import type { Session } from '@inrupt/solid-client-authn-browser'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { getPrimaryPodUrl, loadMultipleFilesFromPod, saveFileToPod, deleteFileFromPod } from '../services/solidPod'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockLoadMultipleFilesFromPod = vi.mocked(loadMultipleFilesFromPod)
const mockSaveFileToPod = vi.mocked(saveFileToPod)
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

function makeDb() {
    return {
        getAllPackingLists: vi.fn().mockResolvedValue([testList]),
        deletePackingList: vi.fn().mockResolvedValue(undefined),
    }
}

function renderComponent() {
    return render(
        <MemoryRouter>
            <PackingLists />
        </MemoryRouter>
    )
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
            } as unknown as PackingAppDatabase,
        })
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
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

        fireEvent.click(screen.getByText('🗑️ Delete'))

        expect(db.deletePackingList).not.toHaveBeenCalled()
    })

    it('shows a confirmation dialog with the list name when Delete is clicked', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        fireEvent.click(screen.getByText('🗑️ Delete'))

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

        fireEvent.click(screen.getByText('🗑️ Delete'))

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

        fireEvent.click(screen.getByText('🗑️ Delete'))

        await screen.findByText(/cannot be undone/i)

        fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

        await waitFor(() => {
            expect(db.deletePackingList).toHaveBeenCalledWith('list-1')
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

    it('shows a Rename button on each list card', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        expect(screen.getByRole('button', { name: /rename/i })).toBeTruthy()
    })

    it('opens a rename modal pre-filled with the current list name when Rename is clicked', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        fireEvent.click(screen.getByRole('button', { name: /rename/i }))

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

        fireEvent.click(screen.getByRole('button', { name: /rename/i }))

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

        fireEvent.click(screen.getByRole('button', { name: /rename/i }))

        await waitFor(() => screen.getByRole('textbox'))

        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

        expect(db.savePackingList).not.toHaveBeenCalled()
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

    it('shows a Duplicate button on each list card', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        expect(screen.getByRole('button', { name: /duplicate/i })).toBeTruthy()
    })

    it('calls savePackingList with a new list named "Copy of {name}" when Duplicate is clicked', async () => {
        const db = { ...makeDb(), savePackingList: vi.fn().mockResolvedValue({ rev: '1' }) }
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        renderComponent()

        await screen.findByText(/Summer Holiday/)

        fireEvent.click(screen.getByRole('button', { name: /duplicate/i }))

        await waitFor(() => {
            expect(db.savePackingList).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Copy of Summer Holiday', id: 'new-uuid' })
            )
        })
    })
})

describe('PackingLists auto-sync on login', () => {
    const loggedInSession = { fetch: vi.fn() } as unknown as Session

    function makeLoggedInDb(lists = [{ id: 'pod-list-1', name: 'Pod List', createdAt: '2026-01-01T00:00:00Z', items: [] }]) {
        return {
            getAllPackingLists: vi.fn().mockResolvedValue(lists),
            deletePackingList: vi.fn().mockResolvedValue(undefined),
            savePackingList: vi.fn().mockResolvedValue({ rev: '1' }),
        }
    }

    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: loggedInSession,
            webId: 'https://timgent.solidcommunity.net/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockGetPrimaryPodUrl.mockResolvedValue('https://timgent.solidcommunity.net')
    })

    it('automatically calls loadMultipleFilesFromPod on mount when logged in', async () => {
        mockUseDatabase.mockReturnValue({ db: makeLoggedInDb() as unknown as PackingAppDatabase })
        mockLoadMultipleFilesFromPod.mockResolvedValue({
            data: [{ id: 'pod-list-1', name: 'Pod List', createdAt: '2026-01-01T00:00:00Z', items: [] }],
            result: { success: true, successCount: 1, failCount: 0, totalCount: 1 },
        })

        renderComponent()

        await waitFor(() => {
            expect(mockLoadMultipleFilesFromPod).toHaveBeenCalled()
        })
    })

    it('does not show a "no data found" toast when pod has no packing lists on auto-sync', async () => {
        const showToast = vi.fn()
        vi.mocked(useToast).mockReturnValue({ showToast })
        mockUseDatabase.mockReturnValue({ db: makeLoggedInDb([]) as unknown as PackingAppDatabase })
        mockLoadMultipleFilesFromPod.mockResolvedValue({
            data: [],
            result: { success: true, successCount: 0, failCount: 0, totalCount: 0 },
        })

        renderComponent()

        await waitFor(() => {
            expect(mockLoadMultipleFilesFromPod).toHaveBeenCalled()
        })
        expect(showToast).not.toHaveBeenCalledWith(
            expect.stringContaining('No packing lists found'),
            expect.anything()
        )
    })
})

describe('PackingLists pod sync on mutation', () => {
    const loggedInSession = { fetch: vi.fn() } as unknown as Session

    function makeDb() {
        return {
            getAllPackingLists: vi.fn().mockResolvedValue([testList]),
            deletePackingList: vi.fn().mockResolvedValue(undefined),
            savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
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
        mockLoadMultipleFilesFromPod.mockResolvedValue({
            data: [],
            result: { success: true, successCount: 0, failCount: 0, totalCount: 0 },
        })
        mockSaveFileToPod.mockResolvedValue(undefined)
        mockDeleteFileFromPod.mockResolvedValue(undefined)
    })

    it('saves renamed list to pod after rename is confirmed', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })

        renderComponent()
        await screen.findByText(/Summer Holiday/)

        fireEvent.click(screen.getByRole('button', { name: /rename/i }))
        await waitFor(() => screen.getByRole('textbox'))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Winter Holiday' } })
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

        await waitFor(() => {
            expect(mockSaveFileToPod).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'list-1.json',
                    data: expect.objectContaining({ id: 'list-1', name: 'Winter Holiday' }),
                })
            )
        })
    })

    it('saves duplicated list to pod after duplicate', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })

        renderComponent()
        await screen.findByText(/Summer Holiday/)

        fireEvent.click(screen.getByRole('button', { name: /duplicate/i }))

        await waitFor(() => {
            expect(mockSaveFileToPod).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'new-uuid.json',
                    data: expect.objectContaining({ name: 'Copy of Summer Holiday' }),
                })
            )
        })
    })

    it('deletes list from pod after delete is confirmed', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })

        renderComponent()
        await screen.findByText(/Summer Holiday/)

        fireEvent.click(screen.getByText('🗑️ Delete'))
        await screen.findByText(/cannot be undone/i)
        fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

        await waitFor(() => {
            expect(mockDeleteFileFromPod).toHaveBeenCalledWith(
                loggedInSession,
                'https://timgent.solidcommunity.net/packing-lists/list-1.json'
            )
        })
    })

    it('does not call saveFileToPod when not logged in', async () => {
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

        fireEvent.click(screen.getByRole('button', { name: /duplicate/i }))

        await waitFor(() => {
            expect(makeDb().savePackingList).toBeDefined()
        })
        expect(mockSaveFileToPod).not.toHaveBeenCalled()
    })
})
