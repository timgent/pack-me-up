import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(() => ({ showToast: vi.fn() })),
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
