import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ViewPackingList } from './view-packing-list'
import type { PackingAppDatabase } from '../services/database'

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

const mockShowToast = vi.fn()
vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(() => ({ showToast: mockShowToast })),
}))

vi.mock('../hooks/usePodSync', () => ({
    usePodSync: vi.fn(),
}))

vi.mock('../hooks/useSyncCoordinator', () => ({
    useSyncCoordinator: vi.fn(),
}))

import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { usePodSync } from '../hooks/usePodSync'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'

vi.mock('../services/solidPod', () => ({
    POD_CONTAINERS: {
        PACKING_LISTS: 'pack-me-up/packing-lists/',
        SHARED_LISTS_WITH_ME: 'pack-me-up/shared-lists-with-me.ttl',
    },
    getPrimaryPodUrl: vi.fn().mockResolvedValue('https://own.solidcommunity.net/'),
    grantCollaboratorAccess: vi.fn(),
    saveRdfToPod: vi.fn().mockResolvedValue(undefined),
    friendlyPodName: vi.fn((url: string) => url),
    friendlyWebIdName: vi.fn((url: string) => url),
    resolveOwnerDisplayName: vi.fn((foafName: string | null | undefined, ownerWebId: string | null | undefined, podUrl: string) => foafName ?? ownerWebId ?? podUrl),
    getPodOwnerName: vi.fn().mockResolvedValue(null),
    deriveWebIdFromPodUrl: vi.fn((url: string) => `${url.replace(/\/+$/, '')}/profile/card#me`),
}))

vi.mock('../components/SharePackingListModal', () => ({
    SharePackingListModal: vi.fn(() => null),
}))

vi.mock('../hooks/useSharedListsSync', () => ({
    useSharedListsSync: vi.fn(() => ({
        sharedListsWithMe: { lists: [], lastModified: '' },
        saveSharedListsWithMe: vi.fn().mockResolvedValue(null),
    })),
}))

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockUsePodSync = vi.mocked(usePodSync)
const mockUseSyncCoordinator = vi.mocked(useSyncCoordinator)

const testPackingList = {
    id: 'test-list-1',
    name: 'Test Trip',
    createdAt: '2026-01-01T00:00:00Z',
    items: [
        {
            id: 'item-1',
            itemText: 'Passport',
            personName: 'Alice',
            personId: 'p1',
            questionId: 'q1',
            optionId: 'o1',
            packed: false,
        },
    ],
}

function makeDb() {
    return {
        getPackingList: vi.fn().mockResolvedValue(testPackingList),
        savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
        getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
        saveSharedListsWithMe: vi.fn().mockResolvedValue({ rev: '1' }),
    }
}

function renderComponent() {
    return render(
        <MemoryRouter initialEntries={['/view-list/test-list-1']}>
            <Routes>
                <Route path="/view-list/:id" element={<ViewPackingList />} />
            </Routes>
        </MemoryRouter>
    )
}

describe('ViewPackingList item deletion confirmation', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({
            saveToPod: vi.fn(),
        })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not immediately delete item when X is clicked', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByTitle('Delete item'))

        expect(screen.getByText('Passport')).toBeTruthy()
    })

    it('shows confirmation dialog when X is clicked', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByTitle('Delete item'))

        expect(screen.getByText('Are you sure you want to remove this item?')).toBeTruthy()
    })

    it('does not delete item when Cancel is clicked in confirmation dialog', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByTitle('Delete item'))
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

        expect(screen.getByText('Passport')).toBeTruthy()
        expect(screen.queryByText('Are you sure you want to remove this item?')).toBeNull()
    })

    it('deletes item when Remove is clicked in confirmation dialog', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByTitle('Delete item'))
        fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))

        await waitFor(() => {
            expect(screen.queryByText('Passport')).toBeNull()
        })
    })
})

const multiCategoryPackingList = {
    id: 'test-list-2',
    name: 'Multi Category Trip',
    createdAt: '2026-01-01T00:00:00Z',
    items: [
        { id: 'item-a1', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false, category: 'Essentials' },
        { id: 'item-a2', itemText: 'Tent', personName: 'Alice', personId: 'p1', questionId: 'q2', optionId: 'o2', packed: false, category: 'Hiking' },
        { id: 'item-a3', itemText: 'Legacy item', personName: 'Alice', personId: 'p1', questionId: 'q3', optionId: 'o3', packed: false },
        { id: 'item-b1', itemText: 'Nappies', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', packed: false, category: 'Essentials' },
    ],
}

function makeDbMultiCategory() {
    return {
        getPackingList: vi.fn().mockResolvedValue(multiCategoryPackingList),
        savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
    }
}

function renderComponentMultiCategory() {
    return render(
        <MemoryRouter initialEntries={['/view-list/test-list-2']}>
            <Routes>
                <Route path="/view-list/:id" element={<ViewPackingList />} />
            </Routes>
        </MemoryRouter>
    )
}

describe('ViewPackingList category grouping', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({ saveToPod: vi.fn() })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...multiCategoryPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDbMultiCategory() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders category headings within a person card', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        expect(screen.getAllByRole('button', { name: /Collapse Essentials/i }).length).toBeGreaterThan(0)
        expect(screen.getByRole('button', { name: /Collapse Hiking/i })).toBeTruthy()
    })

    it('shows items without category under "Other"', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Legacy item')).toBeTruthy())
        expect(screen.getByRole('button', { name: /Collapse Other/i })).toBeTruthy()
    })

    it('items are visible by default', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())
    })

    it('collapses a category when its toggle is clicked', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /Collapse Hiking/i }))
        expect(screen.queryByText('Tent')).toBeNull()
    })

    it('re-expands a category when its toggle is clicked again', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /Collapse Hiking/i }))
        fireEvent.click(screen.getByRole('button', { name: /Expand Hiking/i }))
        expect(screen.getByText('Tent')).toBeTruthy()
    })

    it('shows a "Check all" button per category section', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        // 3 expanded categories (Essentials for Alice, Hiking, Other) plus Essentials for Bob = 4
        const checkAllButtons = screen.getAllByRole('button', { name: /check all/i })
        expect(checkAllButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('checking all items in a category makes the hidden-items banner appear', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())
        // Click "Check all" for the first Hiking-section "Check all" button
        const checkAllButtons = screen.getAllByRole('button', { name: /check all/i })
        fireEvent.click(checkAllButtons[0])
        await waitFor(() => {
            expect(screen.getByText(/item.* hidden/i)).toBeTruthy()
        })
    })

    it('renders Essentials category independently for each person', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        const essentialsToggles = screen.getAllByRole('button', { name: /Collapse Essentials/i })
        expect(essentialsToggles.length).toBe(2)
    })
})

describe('ViewPackingList person/question view toggle', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({ saveToPod: vi.fn() })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...multiCategoryPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDbMultiCategory() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('defaults to person view, showing person section titles', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        expect(screen.getByText("Alice's Items")).toBeTruthy()
        expect(screen.getByText("Bob's Items")).toBeTruthy()
    })

    it('switches to question view, showing category section titles grouped by person within', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Question View' }))

        // Top-level sections are now categories, not people
        expect(screen.queryByText("Alice's Items")).toBeNull()
        expect(screen.queryByText("Bob's Items")).toBeNull()
        expect(screen.getAllByText('Essentials').length).toBeGreaterThan(0)
        expect(screen.getByText('Hiking')).toBeTruthy()

        // Within each category, items are grouped by person
        expect(screen.getAllByRole('button', { name: /Collapse Alice/i }).length).toBeGreaterThan(0)
        expect(screen.getByRole('button', { name: /Collapse Bob/i })).toBeTruthy()
        expect(screen.getByText('Toothbrush')).toBeTruthy()
        expect(screen.getByText('Nappies')).toBeTruthy()
    })

    it('switches back to person view', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Question View' }))
        await waitFor(() => expect(screen.getByText('Hiking')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Person View' }))
        expect(screen.getByText("Alice's Items")).toBeTruthy()
        expect(screen.getByText("Bob's Items")).toBeTruthy()
    })
})

describe('ViewPackingList hidden items banner', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({
            saveToPod: vi.fn(),
        })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not show the hidden items banner when no items are checked', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        expect(screen.queryByText(/item.* hidden/i)).toBeNull()
    })

    it('shows the hidden items banner when an item is checked', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByRole('checkbox'))

        await waitFor(() => {
            expect(screen.getByText(/item.* hidden/i)).toBeTruthy()
        })
    })

    it('hides the banner when "Show Packed" is clicked', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByRole('checkbox'))

        await waitFor(() => expect(screen.getByText(/item.* hidden/i)).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /show packed/i }))

        expect(screen.queryByText(/item.* hidden/i)).toBeNull()
    })

    it('uses primary button variant for "Show Packed" when items are hidden', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByRole('checkbox'))

        await waitFor(() => {
            const showPackedBtn = screen.getByRole('button', { name: /show packed/i })
            expect(showPackedBtn.className).toContain('bg-gradient-primary')
        })
    })
})

describe('ViewPackingList Solid Pod inline box', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({
            saveToPod: vi.fn(),
        })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not show Login with Solid Pod inline box', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        expect(screen.queryByText(/Login with Solid Pod to save your packing list/i)).toBeNull()
    })
})

const testPackingListWithProgress = {
    id: 'test-list-progress',
    name: 'Progress Trip',
    createdAt: '2026-01-01T00:00:00Z',
    items: [
        { id: 'item-1', itemText: 'Passport', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: true },
        { id: 'item-2', itemText: 'Sunscreen', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o2', packed: false },
        { id: 'item-3', itemText: 'Hat', personName: 'Bob', personId: 'p2', questionId: 'q2', optionId: 'o1', packed: true },
        { id: 'item-4', itemText: 'Shoes', personName: 'Bob', personId: 'p2', questionId: 'q2', optionId: 'o2', packed: false },
    ],
}
// Alice: 1/2 packed; Bob: 1/2 packed; Overall: 2/4 packed (50%)

function makeDbWithProgress() {
    return {
        getPackingList: vi.fn().mockResolvedValue(testPackingListWithProgress),
        savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
    }
}

describe('progress indicators', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({ saveToPod: vi.fn() })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingListWithProgress, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDbWithProgress() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderProgressComponent() {
        return render(
            <MemoryRouter initialEntries={['/view-list/test-list-progress']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
    }

    it('shows overall packed count and percentage in toolbar', async () => {
        renderProgressComponent()
        await waitFor(() => expect(screen.getByText('Sunscreen')).toBeTruthy())

        expect(screen.getByText(/2 \/ 4 packed \(50%\)/)).toBeTruthy()
    })

    it('shows per-person packed count in each column header', async () => {
        renderProgressComponent()
        await waitFor(() => expect(screen.getByText('Sunscreen')).toBeTruthy())

        const badges = screen.getAllByText(/1 \/ 2/)
        expect(badges.length).toBe(2)
    })
})

describe('ViewPackingList checked item styling', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({
            saveToPod: vi.fn(),
        })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('applies strikethrough styling to item text when checked', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        // Enable "Show Packed" so the item remains visible after checking
        fireEvent.click(screen.getByRole('button', { name: /show packed/i }))
        fireEvent.click(screen.getByRole('checkbox'))

        await waitFor(() => {
            const span = screen.getByText('Passport')
            expect(span.className).toContain('line-through')
        })
    })

    it('does not apply strikethrough styling when item is unchecked', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        const span = screen.getByText('Passport')
        expect(span.className).not.toContain('line-through')
    })
})

describe('ViewPackingList new item feedback', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({
            saveToPod: vi.fn(),
        })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('highlights a newly added item', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        const input = screen.getByPlaceholderText('Add new item...')
        fireEvent.change(input, { target: { value: 'Sunscreen' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))

        await waitFor(() => {
            const span = screen.getByText('Sunscreen')
            const row = span.closest('div.rounded-lg')
            expect(row?.className).toContain('ring-green-400')
        })
    })

    it('does not highlight items that were not just added', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        const span = screen.getByText('Passport')
        const row = span.closest('div.rounded-lg')
        expect(row?.className).not.toContain('ring-green-400')
    })

    it('scrolls the newly added item into view', async () => {
        const scrollIntoView = vi.fn()
        Element.prototype.scrollIntoView = scrollIntoView

        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        const input = screen.getByPlaceholderText('Add new item...')
        fireEvent.change(input, { target: { value: 'Sunscreen' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))

        await waitFor(() => expect(screen.getByText('Sunscreen')).toBeTruthy())
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    })
})

describe('ViewPackingList inline item editing', () => {
    let db: ReturnType<typeof makeDb>

    beforeEach(() => {
        db = makeDb()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({
            saveToPod: vi.fn(),
        })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('double-clicking item text enters edit mode with current value', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.dblClick(screen.getByText('Passport'))

        const input = screen.getByRole('textbox', { name: /edit item name/i })
        expect(input).toBeTruthy()
        expect((input as HTMLInputElement).value).toBe('Passport')
    })

    it('clicking pencil icon enters edit mode', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByTitle('Edit item'))

        expect(screen.getByRole('textbox', { name: /edit item name/i })).toBeTruthy()
    })

    it('pressing Enter saves renamed item and exits edit mode', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByTitle('Edit item'))
        const input = screen.getByRole('textbox', { name: /edit item name/i })
        fireEvent.change(input, { target: { value: 'Sunscreen SPF50' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        await waitFor(() => expect(screen.getByText('Sunscreen SPF50')).toBeTruthy())
        expect(db.savePackingList).toHaveBeenCalledWith(
            expect.objectContaining({
                items: expect.arrayContaining([
                    expect.objectContaining({ id: 'item-1', itemText: 'Sunscreen SPF50' }),
                ]),
            })
        )
    })

    it('pressing Escape cancels edit and restores original name', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByTitle('Edit item'))
        const input = screen.getByRole('textbox', { name: /edit item name/i })
        fireEvent.change(input, { target: { value: 'Bogus' } })
        fireEvent.keyDown(input, { key: 'Escape' })

        expect(screen.getByText('Passport')).toBeTruthy()
        expect(db.savePackingList).not.toHaveBeenCalled()
    })

    it('clearing all text and pressing Enter does not save and restores original name', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByTitle('Edit item'))
        const input = screen.getByRole('textbox', { name: /edit item name/i })
        fireEvent.change(input, { target: { value: '' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())
        expect(db.savePackingList).not.toHaveBeenCalled()
    })
})

describe('ViewPackingList expandable person sections', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({ saveToPod: vi.fn() })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...multiCategoryPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDbMultiCategory() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('person sections are expanded by default', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        expect(screen.getByText('Toothbrush')).toBeTruthy()
        expect(screen.getByText('Nappies')).toBeTruthy()
    })

    it('clicking person header collapses that person section', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /collapse alice's list/i }))
        expect(screen.queryByText('Toothbrush')).toBeNull()
    })

    it('collapsing one person section does not affect another', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /collapse alice's list/i }))
        expect(screen.getByText('Nappies')).toBeTruthy()
    })

    it('clicking a collapsed person header expands their section', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /collapse alice's list/i }))
        fireEvent.click(screen.getByRole('button', { name: /expand alice's list/i }))
        expect(screen.getByText('Toothbrush')).toBeTruthy()
    })

    it('add-item input is hidden when person section is collapsed', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        const addInputs = screen.getAllByPlaceholderText('Add new item...')
        expect(addInputs.length).toBeGreaterThan(0)
        fireEvent.click(screen.getByRole('button', { name: /collapse alice's list/i }))
        const remainingInputs = screen.getAllByPlaceholderText('Add new item...')
        expect(remainingInputs.length).toBeLessThan(addInputs.length)
    })
})

// ─── Foreign pod (?pod= query param) ────────────────────────────────────────

const FOREIGN_POD_URL = 'https://alice.solidcommunity.net/'

function renderWithForeignPod(podParam?: string) {
    const path = podParam
        ? `/view-list/test-list-1?pod=${encodeURIComponent(podParam)}`
        : '/view-list/test-list-1'
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/view-list/:id" element={<ViewPackingList />} />
            </Routes>
        </MemoryRouter>
    )
}

describe('ViewPackingList foreign pod (?pod= param)', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: { info: { isLoggedIn: true, webId: 'https://own.solidcommunity.net/profile/card#me' }, fetch: vi.fn() },
            webId: 'https://own.solidcommunity.net/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({ saveToPod: vi.fn() })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('passes pathConfig.podUrl to usePodSync when ?pod= param is present', async () => {
        renderWithForeignPod(FOREIGN_POD_URL)

        await waitFor(() => expect(screen.getByText('Test Trip')).toBeTruthy())

        expect(mockUsePodSync).toHaveBeenCalledWith(
            expect.objectContaining({
                pathConfig: expect.objectContaining({ podUrl: FOREIGN_POD_URL }),
            })
        )
    })

    it('does not pass pathConfig.podUrl to usePodSync when ?pod= param is absent', async () => {
        renderWithForeignPod()

        await waitFor(() => expect(screen.getByText('Test Trip')).toBeTruthy())

        const lastCall = mockUsePodSync.mock.calls[mockUsePodSync.mock.calls.length - 1][0]
        expect(lastCall.pathConfig.podUrl).toBeUndefined()
    })

    it('shows "Shared list" badge when ?pod= param is present', async () => {
        renderWithForeignPod(FOREIGN_POD_URL)

        await waitFor(() => expect(screen.getByText('Test Trip')).toBeTruthy())

        expect(screen.getByText('Shared list')).toBeTruthy()
    })

    it('does not show "Shared list" badge when ?pod= param is absent', async () => {
        renderWithForeignPod()

        await waitFor(() => expect(screen.getByText('Test Trip')).toBeTruthy())

        expect(screen.queryByText('Shared list')).toBeNull()
    })

    it('does not show Share button when ?pod= param is present', async () => {
        renderWithForeignPod(FOREIGN_POD_URL)

        await waitFor(() => expect(screen.getByText('Test Trip')).toBeTruthy())

        expect(screen.queryByRole('button', { name: /^share$/i })).toBeNull()
    })

    it('shows Share button when logged in and no ?pod= param', async () => {
        renderWithForeignPod()

        await waitFor(() => expect(screen.getByText('Test Trip')).toBeTruthy())

        await waitFor(() => expect(screen.getByRole('button', { name: /^share$/i })).toBeTruthy())
    })

    it('keeps loading state when getPackingList throws not_found on a foreign pod', async () => {
        const dbWithNotFound = {
            ...makeDb(),
            getPackingList: vi.fn().mockRejectedValue({ name: 'not_found' }),
        }
        mockUseDatabase.mockReturnValue({ db: dbWithNotFound as unknown as PackingAppDatabase })

        renderWithForeignPod(FOREIGN_POD_URL)

        // Loading text should remain visible since we're waiting for pod poll
        await waitFor(() => expect(screen.getByText(/loading/i)).toBeTruthy())
    })

    it('stops loading and shows a toast when foreign pod sync fails before data is loaded', async () => {
        const dbWithNotFound = {
            ...makeDb(),
            getPackingList: vi.fn().mockRejectedValue({ name: 'not_found' }),
        }
        mockUseDatabase.mockReturnValue({ db: dbWithNotFound as unknown as PackingAppDatabase })
        mockShowToast.mockClear()

        renderWithForeignPod(FOREIGN_POD_URL)

        // Wait until the component is in the loading state (DB not_found processed)
        await waitFor(() => expect(screen.getByText(/loading/i)).toBeTruthy())

        // Simulate the pod sync failing (e.g. 403 Forbidden - ACL not set)
        const onSyncError = mockUsePodSync.mock.calls[mockUsePodSync.mock.calls.length - 1][0].onSyncError as (e: string) => void
        act(() => onSyncError('403 Forbidden'))

        // Loading spinner should disappear
        await waitFor(() => expect(screen.queryByText(/loading packing list/i)).toBeNull())

        // Toast should have been shown
        expect(mockShowToast).toHaveBeenCalledWith(
            expect.stringContaining('Could not load shared list'),
            'error',
            expect.any(String)
        )
    })
})

const communalPackingList = {
    id: 'test-list-3',
    name: 'Communal Trip',
    createdAt: '2026-01-01T00:00:00Z',
    items: [
        { id: 'item-c1', itemText: 'Tent', personName: '', personId: '', questionId: 'q2', optionId: 'o2', packed: false, communal: true, category: 'Camping' },
        { id: 'item-c2', itemText: 'First aid kit', personName: '', personId: '', questionId: 'always-needed', optionId: 'always-needed', packed: false, communal: true, category: 'Essentials' },
        { id: 'item-a1', itemText: 'Sleeping bag', personName: 'Alice', personId: 'p1', questionId: 'q2', optionId: 'o2', packed: false, category: 'Camping' },
    ],
}

describe('ViewPackingList shared (communal) section', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({ saveToPod: vi.fn() })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...communalPackingList, _rev: '2' }),
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderCommunal(list = communalPackingList) {
        const db = {
            getPackingList: vi.fn().mockResolvedValue(list),
            savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
        }
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
        render(
            <MemoryRouter initialEntries={[`/view-list/${list.id}`]}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
        return db
    }

    it('renders communal items in a Shared Items section', async () => {
        renderCommunal()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())
        expect(screen.getByText('Shared Items')).toBeTruthy()
        expect(screen.getByText('First aid kit')).toBeTruthy()
        // Per-person items still appear under the person
        expect(screen.getByText("Alice's Items")).toBeTruthy()
        expect(screen.getByText('Sleeping bag')).toBeTruthy()
    })

    it('hides the Shared Items section when all communal items are packed and packed items are hidden', async () => {
        renderCommunal({
            ...communalPackingList,
            items: communalPackingList.items.map(i => i.communal ? { ...i, packed: true } : i),
        })
        await waitFor(() => expect(screen.getByText('Sleeping bag')).toBeTruthy())
        // Packed items are hidden by default, so the fully-packed shared section
        // should disappear just like a fully-packed person's section does
        expect(screen.queryByText('Shared Items')).toBeNull()

        // Showing packed items brings the section back
        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
        expect(screen.getByText('Shared Items')).toBeTruthy()
        expect(screen.getByText('Tent')).toBeTruthy()
    })

    it('does not render a Shared Items section when there are no communal items', async () => {
        renderCommunal({ ...communalPackingList, items: communalPackingList.items.filter(i => !i.communal) })
        await waitFor(() => expect(screen.getByText('Sleeping bag')).toBeTruthy())
        expect(screen.queryByText('Shared Items')).toBeNull()
    })

    it('shows shared packed stats in the section header', async () => {
        renderCommunal()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())
        const header = screen.getByRole('button', { name: /collapse the shared items list/i })
        expect(header.textContent).toContain('0 / 2')
    })

    it('collapsing the shared section hides its items but not person items', async () => {
        renderCommunal()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /collapse the shared items list/i }))
        expect(screen.queryByText('Tent')).toBeNull()
        expect(screen.getByText('Sleeping bag')).toBeTruthy()
    })

    it('"+ Add Shared Items" reveals an empty shared section and is hidden once the section exists', async () => {
        const db = renderCommunal({ ...communalPackingList, items: communalPackingList.items.filter(i => !i.communal) })
        await waitFor(() => expect(screen.getByText('Sleeping bag')).toBeTruthy())
        expect(screen.queryByText('Shared Items')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /add shared items/i }))

        expect(screen.getByText('Shared Items')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /add shared items/i })).toBeNull()

        // Adding an item through the revealed section creates a communal item
        const inputs = screen.getAllByPlaceholderText('Add new item...')
        fireEvent.change(inputs[0], { target: { value: 'Tent' } })
        fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const savedList = db.savePackingList.mock.calls[0][0]
        const added = savedList.items.find((i: { itemText: string }) => i.itemText === 'Tent')
        expect(added.communal).toBe(true)
    })

    it('does not show "+ Add Shared Items" when the list already has communal items', async () => {
        renderCommunal()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())
        expect(screen.queryByRole('button', { name: /add shared items/i })).toBeNull()
    })

    it('adding an item in the shared section creates a communal item', async () => {
        const db = renderCommunal()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())

        // Shared section is rendered first
        const inputs = screen.getAllByPlaceholderText('Add new item...')
        fireEvent.change(inputs[0], { target: { value: 'Camping stove' } })
        fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const savedList = db.savePackingList.mock.calls[0][0]
        const added = savedList.items.find((i: { itemText: string }) => i.itemText === 'Camping stove')
        expect(added).toBeTruthy()
        expect(added.communal).toBe(true)
        expect(added.personId).toBe('')
        expect(added.personName).toBe('')
    })
})
