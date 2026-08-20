import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ViewPackingList, groupByCategory, groupByPerson } from './view-packing-list'
import type { PackingAppDatabase } from '../services/database'
import type { PackingListItem } from '../create-packing-list/types'

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

import { SharePackingListModal } from '../components/SharePackingListModal'
import { getPendingSignInAction, setPendingSignInAction } from '../utils/pendingSignInAction'

vi.mock('../hooks/useSharedListsSync', () => ({
    useSharedListsSync: vi.fn(() => ({
        sharedListsWithMe: { lists: [], lastModified: '' },
        saveSharedListsWithMe: vi.fn().mockResolvedValue(null),
    })),
}))

const mockTapFeedback = vi.fn()
vi.mock('../utils/haptics', () => ({
    tapFeedback: () => mockTapFeedback(),
}))

const mockCaptureException = vi.fn()
vi.mock('@sentry/capacitor', () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
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

// The list view remembers how it was left (folded sections, view mode, whether
// packed items are showing) per list id in localStorage. Tests reuse the same
// ids, so without this each one inherits the last one's folded sections.
beforeEach(() => {
    localStorage.clear()
})

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

    it('removes the row without waiting for the save to come back', async () => {
        // A save that never settles — stands in for a slow phone, or a pod on
        // the end of a bad connection. The row still has to go straight away.
        mockUseDatabase.mockReturnValue({
            db: {
                ...makeDb(),
                savePackingList: vi.fn(() => new Promise(() => {})),
            } as unknown as PackingAppDatabase,
        })

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
    // Two items, so checking one hides an item without finishing the list —
    // a finished list shows the celebration instead of the hidden-items nag.
    const bannerList = {
        ...testPackingList,
        items: [
            ...testPackingList.items,
            { id: 'item-2', itemText: 'Sunhat', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false },
        ],
    }
    const checkPassport = () =>
        fireEvent.click(screen.getByText('Passport').closest('label')!.querySelector('input')!)

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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...bannerList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({
            db: { ...makeDb(), getPackingList: vi.fn().mockResolvedValue(bannerList) } as unknown as PackingAppDatabase,
        })
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

        checkPassport()

        await waitFor(() => {
            expect(screen.getByText(/item.* hidden/i)).toBeTruthy()
        })
    })

    it('hides the banner when "Show Packed" is clicked', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        checkPassport()

        await waitFor(() => expect(screen.getByText(/item.* hidden/i)).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /show packed/i }))

        expect(screen.queryByText(/item.* hidden/i)).toBeNull()
    })

    it('uses primary button variant for "Show Packed" when items are hidden', async () => {
        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        checkPassport()

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

        // The groups inside each card carry counts of their own, so the
        // assertion is scoped to the section headers themselves.
        expect(screen.getByRole('button', { name: /collapse alice's list/i }).textContent).toContain('1 / 2')
        expect(screen.getByRole('button', { name: /collapse bob's list/i }).textContent).toContain('1 / 2')
    })

    it('counts every item in a group, not just the ones on screen', async () => {
        renderProgressComponent()
        await waitFor(() => expect(screen.getByText('Sunscreen')).toBeTruthy())

        // Alice's packed Passport is hidden, but her "Other" group is still
        // half done — showing "1" there would read as a group barely started.
        const aliceGroup = screen.getAllByRole('button', { name: /collapse other/i })[0]
        expect(aliceGroup.textContent).toContain('1 / 2')
    })
})

describe('packing progress bar and milestones', () => {
    // Eight items so a single tick moves progress by 12.5% — enough to step over
    // a milestone boundary without landing exactly on the next one.
    const eightItemList = {
        id: 'test-list-milestones',
        name: 'Milestone Trip',
        createdAt: '2026-01-01T00:00:00Z',
        items: Array.from({ length: 8 }, (_, i) => ({
            id: `m${i}`,
            itemText: `Item ${i}`,
            personName: 'Alice',
            personId: 'p1',
            questionId: 'q1',
            optionId: `o${i}`,
            packed: false,
        })),
    }

    function setup(list: { id: string; items: unknown[] }) {
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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...list, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({
            db: {
                getPackingList: vi.fn().mockResolvedValue(list),
                savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
                getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }),
            } as unknown as PackingAppDatabase,
        })
        return render(
            <MemoryRouter initialEntries={[`/view-list/${list.id}`]}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
    }

    /** Packed items are hidden by default, which reshuffles checkbox order as you tick. */
    function keepPackedItemsVisible() {
        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
    }

    /** Toggles the items in [fromIndex, toIndex) — ticking or unticking, as they stand. */
    function toggleItems(fromIndex: number, toIndex: number) {
        const checkboxes = screen.getAllByRole('checkbox')
        for (let i = fromIndex; i < toIndex; i++) fireEvent.click(checkboxes[i])
    }

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('shows a progress bar filled to the packed proportion', async () => {
        setup(testPackingListWithProgress)
        await waitFor(() => expect(screen.getByText('Sunscreen')).toBeTruthy())

        const fill = await screen.findByTestId('packing-progress-fill')
        expect(fill.style.width).toBe('50%')
    })

    it('leaves the bar empty when nothing is packed', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByText('Item 0')).toBeTruthy())

        expect(screen.getByTestId('packing-progress-fill').style.width).toBe('0%')
    })

    it('exposes progress to assistive tech', async () => {
        setup(testPackingListWithProgress)
        await waitFor(() => expect(screen.getByText('Sunscreen')).toBeTruthy())

        const bar = screen.getByRole('progressbar')
        expect(bar.getAttribute('aria-valuenow')).toBe('50')
        expect(bar.getAttribute('aria-valuemin')).toBe('0')
        expect(bar.getAttribute('aria-valuemax')).toBe('100')
    })

    it('grows the bar as items are packed', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByText('Item 0')).toBeTruthy())
        keepPackedItemsVisible()

        toggleItems(0, 4)

        await waitFor(() => expect(screen.getByTestId('packing-progress-fill').style.width).toBe('50%'))
    })

    it('says nothing encouraging before the first milestone', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByText('Item 0')).toBeTruthy())
        keepPackedItemsVisible()

        toggleItems(0, 1)

        await waitFor(() => expect(screen.getByTestId('packing-progress-fill').style.width).toBe('13%'))
        expect(screen.queryByTestId('progress-milestone')).toBeNull()
    })

    it('cheers the user on at each milestone', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByText('Item 0')).toBeTruthy())
        keepPackedItemsVisible()

        toggleItems(0, 2)
        await waitFor(() => expect(screen.getByTestId('progress-milestone').textContent).toMatch(/good start/i))

        toggleItems(2, 4)
        await waitFor(() => expect(screen.getByTestId('progress-milestone').textContent).toMatch(/halfway/i))

        toggleItems(4, 6)
        await waitFor(() => expect(screen.getByTestId('progress-milestone').textContent).toMatch(/nearly done/i))
    })

    it('does not flicker the milestone when a single item is toggled around the boundary', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByText('Item 0')).toBeTruthy())
        keepPackedItemsVisible()

        toggleItems(0, 2)
        await waitFor(() => expect(screen.getByTestId('progress-milestone')).toBeTruthy())

        const secondItem = screen.getAllByRole('checkbox')[1]
        for (let i = 0; i < 3; i++) {
            fireEvent.click(secondItem)
            await waitFor(() => expect(screen.getByTestId('packing-progress-fill').style.width).toBe('13%'))
            expect(screen.getByTestId('progress-milestone').textContent).toMatch(/good start/i)

            fireEvent.click(secondItem)
            await waitFor(() => expect(screen.getByTestId('packing-progress-fill').style.width).toBe('25%'))
            expect(screen.getByTestId('progress-milestone').textContent).toMatch(/good start/i)
        }
    })

    it('drops the milestone once progress falls well below it', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByText('Item 0')).toBeTruthy())
        keepPackedItemsVisible()

        toggleItems(0, 2)
        await waitFor(() => expect(screen.getByTestId('progress-milestone')).toBeTruthy())

        toggleItems(0, 2)

        await waitFor(() => expect(screen.getByTestId('packing-progress-fill').style.width).toBe('0%'))
        expect(screen.queryByTestId('progress-milestone')).toBeNull()
    })

    it('hands over to the all-packed treatment at 100%', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByText('Item 0')).toBeTruthy())
        keepPackedItemsVisible()

        toggleItems(0, 8)

        // The section header celebrates too, so the strip is one of several
        await waitFor(() => expect(screen.getAllByText('🎉 All packed!').length).toBeGreaterThan(0))
        expect(screen.queryByTestId('progress-milestone')).toBeNull()
        expect(screen.getByTestId('packing-progress-fill').style.width).toBe('100%')
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

describe('ViewPackingList item quantities', () => {
    const quantityPackingList = {
        id: 'test-list-1',
        name: 'Weekend Away',
        createdAt: '2026-01-01T00:00:00Z',
        items: [
            {
                id: 'item-socks',
                itemText: 'Socks',
                personName: 'Alice',
                personId: 'p1',
                questionId: 'q1',
                optionId: 'o1',
                packed: false,
                quantity: 3,
            },
            {
                id: 'item-passport',
                itemText: 'Passport',
                personName: 'Alice',
                personId: 'p1',
                questionId: 'q1',
                optionId: 'o1',
                packed: false,
            },
        ],
    }
    let db: ReturnType<typeof makeDb>

    beforeEach(() => {
        db = makeDb()
        db.getPackingList.mockResolvedValue(quantityPackingList)
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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...quantityPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('shows a ×N badge for items with a quantity', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Socks')).toBeTruthy())
        expect(screen.getByText('×3')).toBeTruthy()
    })

    it('shows no badge for items without a quantity', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())
        expect(screen.getAllByText(/^×\d+$/)).toHaveLength(1)
    })

    it('edit mode pre-fills the quantity and saves an updated value', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Socks')).toBeTruthy())

        fireEvent.dblClick(screen.getByText('Socks'))
        const quantityInput = screen.getByRole('spinbutton', { name: /edit item quantity/i })
        expect((quantityInput as HTMLInputElement).value).toBe('3')

        fireEvent.change(quantityInput, { target: { value: '5' } })
        fireEvent.keyDown(quantityInput, { key: 'Enter' })

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalledWith(
            expect.objectContaining({
                items: expect.arrayContaining([
                    expect.objectContaining({ id: 'item-socks', quantity: 5 }),
                ]),
            })
        ))
    })

    it('clearing the quantity removes it from the item', async () => {
        renderComponent()
        await waitFor(() => expect(screen.getByText('Socks')).toBeTruthy())

        fireEvent.dblClick(screen.getByText('Socks'))
        const quantityInput = screen.getByRole('spinbutton', { name: /edit item quantity/i })
        fireEvent.change(quantityInput, { target: { value: '' } })
        fireEvent.keyDown(quantityInput, { key: 'Enter' })

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalledWith(
            expect.objectContaining({
                items: expect.arrayContaining([
                    expect.objectContaining({ id: 'item-socks', quantity: undefined }),
                ]),
            })
        ))
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

    it('does not sync from the pod until the local copy has been read', async () => {
        // A pod copy applied before the page knows what is on the device
        // overwrites it — including an edit whose pod write hasn't landed yet.
        mockUseDatabase.mockReturnValue({
            db: {
                ...makeDb(),
                getPackingList: vi.fn(() => new Promise(() => {})),
            } as unknown as PackingAppDatabase,
        })

        render(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )

        await waitFor(() => expect(mockUsePodSync).toHaveBeenCalled())
        for (const [options] of mockUsePodSync.mock.calls) {
            expect(options.enabled).toBe(false)
        }
    })

    it('syncs from the pod once the local copy has been read', async () => {
        render(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )

        await waitFor(() => expect(screen.getByText('Test Trip')).toBeTruthy())

        expect(mockUsePodSync).toHaveBeenLastCalledWith(
            expect.objectContaining({ enabled: true })
        )
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

    it('uses the shared loading treatment while the packing list loads', async () => {
        const dbWithNotFound = {
            ...makeDb(),
            getPackingList: vi.fn().mockRejectedValue({ name: 'not_found' }),
        }
        mockUseDatabase.mockReturnValue({ db: dbWithNotFound as unknown as PackingAppDatabase })

        renderWithForeignPod(FOREIGN_POD_URL)

        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Loading packing list...'))
        expect(screen.getAllByTestId('loading-skeleton-card').length).toBeGreaterThan(0)
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

// ─── Own-pod list not in local storage yet ──────────────────────────────────
//
// DatabaseContext renders the app as soon as the pod database is resolved and
// runs `syncAllDataFromPod` in the background, so a device that has never seen
// a list locally (a fresh browser, or a deep link to a list created on another
// device) hits `getPackingList` before the login sync has written it. That is
// not an error — the pod poll hydrates the page moments later — but it used to
// be captured, and because the miss is thrown as a plain `{ name, message }`
// object it reached Sentry as "Object captured as exception with keys:
// message, name" with no usable stack.

describe('ViewPackingList when an own-pod list is not in local storage yet', () => {
    function renderMissingLocally(extraDbContext: Record<string, unknown> = {}) {
        const getPackingList = vi.fn().mockRejectedValue({ name: 'not_found', message: 'Packing list not found' })
        mockUseDatabase.mockReturnValue({
            db: { ...makeDb(), getPackingList } as unknown as PackingAppDatabase,
            ...extraDbContext,
        })
        const result = render(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
        return { ...result, getPackingList }
    }

    beforeEach(() => {
        mockCaptureException.mockClear()
        vi.spyOn(console, 'error').mockImplementation(() => {})
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
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not report the local miss to Sentry', async () => {
        const { getPackingList } = renderMissingLocally()

        await waitFor(() => expect(getPackingList).toHaveBeenCalled())
        await waitFor(() => expect(screen.getByText('Packing list not found')).toBeTruthy())
        expect(mockCaptureException).not.toHaveBeenCalled()
    })

    it('does not read from local storage while the login sync is still running', async () => {
        const { getPackingList } = renderMissingLocally({ loginSyncInProgress: true })

        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Loading packing list...'))
        expect(getPackingList).not.toHaveBeenCalled()
        expect(screen.queryByText('Packing list not found')).toBeNull()
    })

    it('reads local storage once the login sync finishes', async () => {
        const getPackingList = vi.fn().mockRejectedValue({ name: 'not_found', message: 'Packing list not found' })
        const db = { ...makeDb(), getPackingList } as unknown as PackingAppDatabase
        mockUseDatabase.mockReturnValue({ db, loginSyncInProgress: true })

        const { rerender } = render(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
        expect(getPackingList).not.toHaveBeenCalled()

        mockUseDatabase.mockReturnValue({ db, loginSyncInProgress: false })
        rerender(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )

        await waitFor(() => expect(getPackingList).toHaveBeenCalledWith('test-list-1'))
        expect(mockCaptureException).not.toHaveBeenCalled()
    })

    it('hydrates from the pod once the poll succeeds', async () => {
        renderMissingLocally()

        await waitFor(() => expect(mockUsePodSync).toHaveBeenCalled())
        const updateFormAndState = mockUseSyncCoordinator.mock.calls[mockUseSyncCoordinator.mock.calls.length - 1][0]
            .updateFormAndState as (data: unknown, rev: string) => void
        act(() => updateFormAndState(testPackingList, '2'))

        await waitFor(() => expect(screen.getByText('Test Trip')).toBeTruthy())
        expect(mockCaptureException).not.toHaveBeenCalled()
    })

    it('still reports a genuine load failure to Sentry', async () => {
        const failure = new Error('IndexedDB unavailable')
        mockUseDatabase.mockReturnValue({
            db: { ...makeDb(), getPackingList: vi.fn().mockRejectedValue(failure) } as unknown as PackingAppDatabase,
        })

        render(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )

        await waitFor(() => expect(mockCaptureException).toHaveBeenCalledWith(failure))
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

    it('celebrates the Shared Items section when all communal items are packed', async () => {
        renderCommunal({
            ...communalPackingList,
            items: communalPackingList.items.map(i => i.communal ? { ...i, packed: true } : i),
        })
        await waitFor(() => expect(screen.getByText('Sleeping bag')).toBeTruthy())
        // Packed items are hidden by default, but the fully-packed shared section
        // stays put with its celebration, just like a fully-packed person's section
        expect(screen.getByText('Shared Items')).toBeTruthy()
        expect(screen.getByLabelText(/all packed for shared items/i)).toBeTruthy()

        // Showing packed items reveals the items themselves again
        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
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

describe('ViewPackingList shared (communal) items in question view', () => {
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

    async function renderInQuestionView(list = communalPackingList) {
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
        await waitFor(() => expect(screen.getByText('Sleeping bag')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: 'Question View' }))
        return db
    }

    /** The card for a category section, found by its own collapse control. */
    function card(title: string): HTMLElement {
        const match = screen.getAllByTestId('list-section').find(section =>
            within(section).queryByRole('button', { name: new RegExp(`(Collapse|Expand) ${title} list`, 'i') })
        )
        if (!match) throw new Error(`No "${title}" card on the page`)
        return match
    }

    it('files shared items into their section rather than a Shared Items card', async () => {
        await renderInQuestionView()

        expect(screen.queryByText('Shared Items')).toBeNull()
        expect(within(card('Camping')).getByText('Tent')).toBeTruthy()
        expect(within(card('Camping')).getByText('Sleeping bag')).toBeTruthy()
        expect(within(card('Essentials')).getByText('First aid kit')).toBeTruthy()
    })

    it('groups shared items under Shared, ahead of the people', async () => {
        await renderInQuestionView()

        const headings = within(card('Camping'))
            .getAllByRole('button', { name: /^Collapse / })
            .map(button => button.getAttribute('aria-label'))
        expect(headings).toEqual(['Collapse Camping list', 'Collapse Shared', 'Collapse Alice'])
    })

    it('counts shared items in the section and group totals', async () => {
        await renderInQuestionView()

        const camping = within(card('Camping'))
        expect(camping.getByRole('button', { name: /collapse camping list/i }).textContent).toContain('0 / 2')
        expect(camping.getByRole('button', { name: 'Collapse Shared' }).textContent).toContain('0 / 1')
    })

    it('adds a shared item from the shared group of a section', async () => {
        const db = await renderInQuestionView()

        const camping = within(card('Camping'))
        fireEvent.click(camping.getByRole('button', { name: /add item to camping for shared items/i }))
        const composer = camping.getAllByTestId('add-item-composer')
            .find(node => within(node).queryByLabelText(/add an item to camping for shared items/i))
        expect(composer).toBeTruthy()
        fireEvent.change(within(composer!).getByLabelText(/add an item to camping for shared items/i), {
            target: { value: 'Camping stove' },
        })
        fireEvent.click(within(composer!).getByRole('button', { name: 'Add' }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const saved = db.savePackingList.mock.calls[0][0]
        const added = saved.items.find((i: { itemText: string }) => i.itemText === 'Camping stove')
        expect(added.communal).toBe(true)
        expect(added.category).toBe('Camping')
        expect(added.personName).toBe('')
    })

    it('offers Shared in a section\'s who-for picker, so shared items can be added without a shared card', async () => {
        const listWithoutCommunal = { ...communalPackingList, items: communalPackingList.items.filter(i => !i.communal) }
        const db = await renderInQuestionView(listWithoutCommunal)

        const composer = within(card('Camping')).getByTestId('add-item-composer')
        fireEvent.change(within(composer).getByLabelText(/add an item to camping/i), { target: { value: 'Camping stove' } })
        fireEvent.change(within(composer).getByLabelText('Who for'), { target: { value: 'Shared' } })
        fireEvent.click(within(composer).getByRole('button', { name: 'Add' }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const saved = db.savePackingList.mock.calls[0][0]
        const added = saved.items.find((i: { itemText: string }) => i.itemText === 'Camping stove')
        expect(added.communal).toBe(true)
        expect(added.category).toBe('Camping')
        expect(added.personName).toBe('')
    })

    it('leaves the who-for picker on a person by default', async () => {
        const db = await renderInQuestionView()

        const composer = within(card('Camping')).getAllByTestId('add-item-composer')[0]
        fireEvent.change(within(composer).getByLabelText(/add an item to camping/i), { target: { value: 'Head torch' } })
        fireEvent.click(within(composer).getByRole('button', { name: 'Add' }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const saved = db.savePackingList.mock.calls[0][0]
        const added = saved.items.find((i: { itemText: string }) => i.itemText === 'Head torch')
        expect(added.personName).toBe('Alice')
        expect(added.communal).toBeUndefined()
    })

    it('hides the "+ Add Shared Items" reveal, which belongs to person view', async () => {
        const listWithoutCommunal = { ...communalPackingList, items: communalPackingList.items.filter(i => !i.communal) }
        await renderInQuestionView(listWithoutCommunal)

        expect(screen.queryByRole('button', { name: /add shared items/i })).toBeNull()
    })

    it('keeps the Shared Items card in person view', async () => {
        await renderInQuestionView()

        fireEvent.click(screen.getByRole('button', { name: 'Person View' }))

        expect(screen.getByText('Shared Items')).toBeTruthy()
        expect(screen.getByText('Tent')).toBeTruthy()
    })
})

describe('grouping honours generated item order', () => {
    const mk = (over: Partial<PackingListItem>): PackingListItem => ({
        id: Math.random().toString(36).slice(2),
        itemText: 'Item',
        personId: 'p1',
        personName: 'Alice',
        questionId: 'q1',
        optionId: 'o1',
        packed: false,
        ...over,
    })

    it('sorts items within a category by order, not alphabetically', () => {
        const groups = groupByCategory([
            mk({ itemText: 'Zebra print towel', category: 'Beach', order: 0 }),
            mk({ itemText: 'Armbands', category: 'Beach', order: 1 }),
        ])
        expect(groups[0].items.map(i => i.itemText)).toEqual(['Zebra print towel', 'Armbands'])
    })

    it('keeps legacy items (no order) alphabetical', () => {
        const groups = groupByCategory([
            mk({ itemText: 'Zebra print towel', category: 'Beach' }),
            mk({ itemText: 'Armbands', category: 'Beach' }),
        ])
        expect(groups[0].items.map(i => i.itemText)).toEqual(['Armbands', 'Zebra print towel'])
    })

    it('places items without order after ordered ones in the same category', () => {
        const groups = groupByCategory([
            mk({ itemText: 'Custom addition', category: 'Beach' }),
            mk({ itemText: 'Towel', category: 'Beach', order: 0 }),
        ])
        expect(groups[0].items.map(i => i.itemText)).toEqual(['Towel', 'Custom addition'])
    })

    it('orders categories by their first item, keeping Essentials first and Other last', () => {
        const groups = groupByCategory([
            mk({ itemText: 'Sunscreen', category: 'Essentials', order: 5 }),
            mk({ itemText: 'Towel', category: 'Beach', order: 2 }),
            mk({ itemText: 'Boots', category: 'Hiking', order: 0 }),
            mk({ itemText: 'Mystery', category: undefined, order: 1 }),
        ])
        expect(groups.map(g => g.label)).toEqual(['Essentials', 'Hiking', 'Beach', 'Other'])
    })

    it('follows the list\'s own section order when it has one', () => {
        const groups = groupByCategory([
            mk({ itemText: 'Sunscreen', category: 'Essentials', order: 0 }),
            mk({ itemText: 'Towel', category: 'Beach', order: 1 }),
            mk({ itemText: 'Boots', category: 'Hiking', order: 2 }),
        ], ['Hiking', 'Beach', 'Essentials'])
        expect(groups.map(g => g.label)).toEqual(['Hiking', 'Beach', 'Essentials'])
    })

    it('keeps Other last even when the list has its own section order', () => {
        const groups = groupByCategory([
            mk({ itemText: 'Mystery', category: undefined, order: 0 }),
            mk({ itemText: 'Boots', category: 'Hiking', order: 1 }),
        ], ['Hiking'])
        expect(groups.map(g => g.label)).toEqual(['Hiking', 'Other'])
    })

    it('puts a section the order says nothing about after the ones it names', () => {
        const groups = groupByCategory([
            mk({ itemText: 'Kite', category: 'Added by hand', order: 0 }),
            mk({ itemText: 'Boots', category: 'Hiking', order: 1 }),
        ], ['Hiking'])
        expect(groups.map(g => g.label)).toEqual(['Hiking', 'Added by hand'])
    })

    it('keeps legacy category ordering alphabetical when no items carry order', () => {
        const groups = groupByCategory([
            mk({ itemText: 'Towel', category: 'Beach' }),
            mk({ itemText: 'Boots', category: 'Hiking' }),
            mk({ itemText: 'Sunscreen', category: 'Essentials' }),
        ])
        expect(groups.map(g => g.label)).toEqual(['Essentials', 'Beach', 'Hiking'])
    })

    it('sorts items within a person by order in person view', () => {
        const groups = groupByPerson([
            mk({ itemText: 'Zebra print towel', order: 0 }),
            mk({ itemText: 'Armbands', order: 1 }),
        ])
        expect(groups[0].items.map(i => i.itemText)).toEqual(['Zebra print towel', 'Armbands'])
    })
})

const updatablePackingList = {
    id: 'test-list-4',
    name: 'Updatable Trip',
    createdAt: '2026-01-01T00:00:00Z',
    selectedPeopleIds: ['p1'],
    questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
    items: [
        { id: 'item-existing', itemText: 'Swimsuit', personName: 'Alice', personId: 'p1', questionId: 'q-activities', optionId: 'opt-swimming', packed: false },
    ],
}

// Question set that now has a new item (Goggles) in the answered option
const questionSetWithNewItem = {
    _id: 'question-set',
    people: [{ id: 'p1', name: 'Alice' }],
    alwaysNeededItems: [],
    questions: [{
        id: 'q-activities',
        type: 'saved',
        text: 'Activities?',
        order: 0,
        questionType: 'multiple-choice',
        options: [{
            id: 'opt-swimming',
            text: 'Swimming',
            order: 0,
            items: [
                { text: 'Swimsuit', personSelections: [{ personId: 'p1', selected: true }] },
                { text: 'Goggles', personSelections: [{ personId: 'p1', selected: true }] },
            ],
        }],
    }],
}

describe('ViewPackingList update from questions', () => {
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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...updatablePackingList, _rev: '2' }),
        })
        mockShowToast.mockClear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderUpdatable(options: { list?: typeof updatablePackingList; getQuestionSet?: ReturnType<typeof vi.fn> } = {}) {
        const list = options.list ?? updatablePackingList
        const db = {
            getPackingList: vi.fn().mockResolvedValue(list),
            savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
            getQuestionSet: options.getQuestionSet ?? vi.fn().mockResolvedValue(questionSetWithNewItem),
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

    it('hides the button when no question set exists', async () => {
        renderUpdatable({ getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }) })
        await waitFor(() => expect(screen.getByText('Swimsuit')).toBeTruthy())
        expect(screen.queryByRole('button', { name: /update from questions/i })).toBeNull()
    })

    it('shows new items in a preview when the question set has additions', async () => {
        renderUpdatable()
        await waitFor(() => expect(screen.getByText('Swimsuit')).toBeTruthy())

        fireEvent.click(await screen.findByRole('button', { name: /update from questions/i }))

        // Preview modal lists the new item, not the one already on the list
        await waitFor(() => expect(screen.getByRole('button', { name: /add 1 item/i })).toBeTruthy())
        expect(screen.getByLabelText(/add goggles/i)).toBeTruthy()
    })

    it('toasts and shows no preview when the list already matches', async () => {
        // Question set whose only item is already on the list
        const matchingQs = {
            ...questionSetWithNewItem,
            questions: [{
                ...questionSetWithNewItem.questions[0],
                options: [{
                    ...questionSetWithNewItem.questions[0].options[0],
                    items: [{ text: 'Swimsuit', personSelections: [{ personId: 'p1', selected: true }] }],
                }],
            }],
        }
        renderUpdatable({ getQuestionSet: vi.fn().mockResolvedValue(matchingQs) })
        await waitFor(() => expect(screen.getByText('Swimsuit')).toBeTruthy())

        fireEvent.click(await screen.findByRole('button', { name: /update from questions/i }))

        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('This list already matches your questions', 'success'))
        expect(screen.queryByRole('button', { name: /add 1 item/i })).toBeNull()
    })

    it('excludes an unchecked item and persists only the selected additions', async () => {
        const db = renderUpdatable({
            list: {
                ...updatablePackingList,
                questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
                items: [],
            },
        })
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Updatable Trip' })).toBeTruthy())

        fireEvent.click(await screen.findByRole('button', { name: /update from questions/i }))
        await screen.findByRole('button', { name: /add 2 items/i })

        // Uncheck Swimsuit, leaving only Goggles
        fireEvent.click(screen.getByLabelText(/add swimsuit/i))
        fireEvent.click(screen.getByRole('button', { name: /add 1 item/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const saved = db.savePackingList.mock.calls[0][0]
        const texts = saved.items.map((i: { itemText: string }) => i.itemText)
        expect(texts).toContain('Goggles')
        expect(texts).not.toContain('Swimsuit')
    })

    it('is hidden for foreign lists', async () => {
        const db = {
            getPackingList: vi.fn().mockResolvedValue(updatablePackingList),
            savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
            getQuestionSet: vi.fn().mockResolvedValue(questionSetWithNewItem),
        }
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
        render(
            <MemoryRouter initialEntries={[`/view-list/${updatablePackingList.id}?pod=${encodeURIComponent('https://foreign.example/')}`]}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
        await waitFor(() => expect(screen.getByText('Swimsuit')).toBeTruthy())
        expect(screen.queryByRole('button', { name: /update from questions/i })).toBeNull()
    })
})

describe('ViewPackingList section completion celebration', () => {
    // Alice is fully packed; Bob still has an item outstanding.
    const partiallyPackedList = {
        id: 'test-list-complete',
        name: 'Half Packed Trip',
        createdAt: '2026-01-01T00:00:00Z',
        items: [
            { id: 'a1', itemText: 'Passport', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', category: 'Documents', packed: true },
            { id: 'a2', itemText: 'Sunhat', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', category: 'Clothes', packed: true },
            { id: 'b1', itemText: 'Wellies', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', category: 'Clothes', packed: true },
            { id: 'b2', itemText: 'Toothbrush', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', category: 'Toiletries', packed: false },
        ],
    }

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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...partiallyPackedList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({
            db: {
                getPackingList: vi.fn().mockResolvedValue(partiallyPackedList),
                savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
                getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }),
            } as unknown as PackingAppDatabase,
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderList() {
        return render(
            <MemoryRouter initialEntries={['/view-list/test-list-complete']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
    }

    it("keeps a fully packed person's section visible while packed items are hidden", async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        expect(screen.getByText("Alice's Items")).toBeTruthy()
    })

    it("celebrates a person whose items are all packed", async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        expect(screen.getByLabelText(/all packed for alice/i)).toBeTruthy()
    })

    it('does not celebrate a person with items still to pack', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        expect(screen.queryByLabelText(/all packed for bob/i)).toBeNull()
    })

    it('celebrates a person as soon as their last item is checked', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
        expect(screen.queryByLabelText(/all packed for bob/i)).toBeNull()

        // Toothbrush is the only unpacked item, so the only visible checkbox
        fireEvent.click(screen.getAllByRole('checkbox')[0])

        await waitFor(() => expect(screen.getByLabelText(/all packed for bob/i)).toBeTruthy())
    })

    it('celebrates a fully packed category in question view', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /question view/i }))

        // Documents (Passport) is fully packed; Toiletries (Toothbrush) is not
        expect(screen.getByText('Documents')).toBeTruthy()
        expect(screen.getByLabelText(/all packed for documents/i)).toBeTruthy()
        expect(screen.queryByLabelText(/all packed for toiletries/i)).toBeNull()
    })
})

describe('ViewPackingList completion', () => {
    // Everything packed except Bob's toothbrush — one tick from done
    const oneItemLeftList = {
        id: 'test-list-finale',
        name: 'Nearly Done Trip',
        createdAt: '2026-01-01T00:00:00Z',
        items: [
            { id: 'a1', itemText: 'Passport', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: true },
            { id: 'b2', itemText: 'Toothbrush', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', packed: false },
        ],
    }

    const fullyPackedList = {
        ...oneItemLeftList,
        id: 'test-list-finale-done',
        items: oneItemLeftList.items.map(i => ({ ...i, packed: true })),
    }

    function setup(list: typeof oneItemLeftList) {
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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...list, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({
            db: {
                getPackingList: vi.fn().mockResolvedValue(list),
                savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
                getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }),
            } as unknown as PackingAppDatabase,
        })
        return render(
            <MemoryRouter initialEntries={[`/view-list/${list.id}`]}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
    }

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not fire confetti while items remain', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        expect(screen.queryByTestId('completion-confetti')).toBeNull()
    })

    it('fires confetti when the last item is checked', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        await waitFor(() => expect(screen.getByTestId('completion-confetti')).toBeTruthy())
    })

    it('does not fire confetti when opening a list that was already packed', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByText('Nearly Done Trip')).toBeTruthy())

        expect(screen.queryByTestId('completion-confetti')).toBeNull()
    })

    it('folds the person cards away once everything is packed', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(screen.getByText("Bob's Items")).toBeTruthy())

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        await waitFor(() => expect(screen.queryByText("Bob's Items")).toBeNull())
        expect(screen.queryByText("Alice's Items")).toBeNull()
    })

    it('leaves the celebration banner standing when the cards fold away', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        await waitFor(() => expect(screen.queryByText("Bob's Items")).toBeNull())
        expect(screen.getByText("You're all packed!")).toBeTruthy()
    })

    it('opens an already-packed list with the cards already folded away', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.queryByText("Alice's Items")).toBeNull())
        expect(screen.getByText("You're all packed!")).toBeTruthy()
    })

    it('brings the cards back when packed items are shown', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByText("You're all packed!")).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))

        expect(screen.getByText("Alice's Items")).toBeTruthy()
        expect(screen.getByText('Passport')).toBeTruthy()
    })

    it('hides the "packed items hidden" nag once everything is packed', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByText("You're all packed!")).toBeTruthy())

        expect(screen.queryByText(/packed items? hidden/i)).toBeNull()
    })

    it('holds the banner back while the cards are still folding away', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        // Confetti and the fold-away start in the same render, so at this point
        // the stage is still being cleared and the banner shouldn't have arrived
        await waitFor(() => expect(screen.getByTestId('completion-confetti')).toBeTruthy())
        expect(screen.queryByTestId('completion-banner')).toBeNull()
    })

    it('rises the banner in once the cards have gone', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        await waitFor(() => expect(screen.getByTestId('completion-banner')).toBeTruthy())
        expect(screen.getByTestId('completion-banner').className).toContain('celebration-banner-rising')
    })

    it('keeps the gentle entrance when reopening a finished list', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByTestId('completion-banner')).toBeTruthy())

        const banner = screen.getByTestId('completion-banner')
        expect(banner.className).toContain('celebration-banner')
        expect(banner.className).not.toContain('celebration-banner-rising')
    })

    it('shows the banner straight away when packed items are being shown', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        // Nothing folds away in this mode, so there is no stage to clear
        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
        fireEvent.click(screen.getByText('Toothbrush').closest('label')!.querySelector('input')!)

        await waitFor(() => expect(screen.getByTestId('completion-banner')).toBeTruthy())
        expect(screen.getByTestId('completion-banner').className).not.toContain('celebration-banner-rising')
    })

    it('restores the cards if an item is unpacked again', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByText("You're all packed!")).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
        const passport = screen.getByText('Passport').closest('label')!.querySelector('input')!
        fireEvent.click(passport)
        fireEvent.click(screen.getByRole('button', { name: 'Hide Packed' }))

        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())
    })
})

describe('ViewPackingList trip destination and dates', () => {
    const localDate = (y: number, m: number, d: number) => new Date(y, m, d).toLocaleDateString()

    function makeTripDb(overrides: Record<string, unknown>) {
        return {
            getPackingList: vi.fn().mockResolvedValue({ ...testPackingList, ...overrides }),
            savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
            getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
            saveSharedListsWithMe: vi.fn().mockResolvedValue({ rev: '1' }),
        }
    }

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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('shows the destination and trip dates under the list name', async () => {
        mockUseDatabase.mockReturnValue({
            db: makeTripDb({
                destination: 'Lisbon, Portugal',
                startDate: '2026-07-12',
                endDate: '2026-07-19',
            }) as unknown as PackingAppDatabase,
        })

        renderComponent()

        const details = await screen.findByTestId('trip-details')
        expect(details.textContent).toContain('Lisbon, Portugal')
        expect(details.textContent).toContain(localDate(2026, 6, 12))
        expect(details.textContent).toContain(localDate(2026, 6, 19))
    })

    it('shows the destination on its own when there are no trip dates', async () => {
        mockUseDatabase.mockReturnValue({
            db: makeTripDb({ destination: 'Lisbon, Portugal' }) as unknown as PackingAppDatabase,
        })

        renderComponent()

        const details = await screen.findByTestId('trip-details')
        expect(details.textContent).toContain('Lisbon, Portugal')
    })

    it('shows no trip details at all when the list has none', async () => {
        mockUseDatabase.mockReturnValue({ db: makeTripDb({}) as unknown as PackingAppDatabase })

        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())
        expect(screen.queryByTestId('trip-details')).toBeNull()
    })
})

describe('ViewPackingList check-off feedback', () => {
    // Two people so the list is never finished by a single tick — the completion
    // celebration has its own tests and would otherwise mask the per-item one.
    const feedbackList = {
        id: 'test-list-feedback',
        name: 'Feedback Trip',
        createdAt: '2026-01-01T00:00:00Z',
        items: [
            { id: 'a1', itemText: 'Passport', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false },
            { id: 'a2', itemText: 'Sunhat', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false },
            { id: 'b1', itemText: 'Wellies', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', packed: true },
        ],
    }

    let saveWithSyncPrevention: ReturnType<typeof vi.fn>

    beforeEach(() => {
        mockTapFeedback.mockClear()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUsePodSync.mockReturnValue({ saveToPod: vi.fn() })
        saveWithSyncPrevention = vi.fn().mockResolvedValue({ ...feedbackList, _rev: '2' })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention,
        })
        mockUseDatabase.mockReturnValue({
            db: {
                getPackingList: vi.fn().mockResolvedValue(feedbackList),
                savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
                getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }),
            } as unknown as PackingAppDatabase,
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function renderList() {
        return render(
            <MemoryRouter initialEntries={['/view-list/test-list-feedback']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
    }

    function checkboxFor(itemText: string) {
        return screen.getByText(itemText).closest('label')!.querySelector('input')!
    }

    function preferReducedMotion() {
        vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
            matches: query.includes('prefers-reduced-motion'),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList)
    }

    it('taps back when an item is checked', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(checkboxFor('Passport'))

        expect(mockTapFeedback).toHaveBeenCalledTimes(1)
    })

    it('stays silent when an item is unchecked', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
        fireEvent.click(checkboxFor('Wellies'))

        expect(mockTapFeedback).not.toHaveBeenCalled()
    })

    it('plays a flourish on the row that was just checked', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(checkboxFor('Passport'))

        expect(screen.getByTestId('item-tick-a1')).toBeTruthy()
        expect(screen.getByTestId('item-row-a1').className).toContain('item-row-packed')
    })

    it('flourishes only the row that was checked', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(checkboxFor('Passport'))

        expect(screen.queryByTestId('item-tick-a2')).toBeNull()
        expect(screen.getByTestId('item-row-a2').className).not.toContain('item-row-packed')
    })

    it('holds the row on screen for the flourish before whisking it away', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(checkboxFor('Passport'))

        // Packed items are hidden, but the row waits for its moment first
        expect(screen.getByText('Passport')).toBeTruthy()
        await waitFor(() => expect(screen.queryByText('Passport')).toBeNull())
    })

    it('does not flourish when an item is unchecked', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
        fireEvent.click(checkboxFor('Wellies'))

        expect(screen.queryByTestId('item-tick-b1')).toBeNull()
        expect(screen.getByTestId('item-row-b1').className).not.toContain('item-row-packed')
    })

    it('holds still for anyone who asked for reduced motion', async () => {
        preferReducedMotion()
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(checkboxFor('Passport'))

        expect(screen.queryByTestId('item-tick-a1')).toBeNull()
        await waitFor(() => expect(screen.queryByText('Passport')).toBeNull())
    })

    it('still taps back when motion is reduced', async () => {
        preferReducedMotion()
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(checkboxFor('Passport'))

        expect(mockTapFeedback).toHaveBeenCalledTimes(1)
    })

    it('gives feedback immediately, without waiting on the debounced save', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(checkboxFor('Passport'))

        // The save is 800ms of debounce away; the feedback has already happened
        expect(saveWithSyncPrevention).not.toHaveBeenCalled()
        expect(mockTapFeedback).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('item-tick-a1')).toBeTruthy()
    })
})

// ─── Adding items ───────────────────────────────────────────────────────────

describe('ViewPackingList adding items', () => {
    let db: ReturnType<typeof makeDbMultiCategory>

    beforeEach(() => {
        db = makeDbMultiCategory()
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
            saveWithSyncPrevention: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function savedItem(text: string): Promise<PackingListItem> {
        let found: PackingListItem | undefined
        await waitFor(() => {
            const calls = db.savePackingList.mock.calls
            // Last match, not first: an item added for one person may share its
            // name with one somebody else already has.
            found = calls.at(-1)?.[0].items.findLast((i: PackingListItem) => i.itemText === text)
            expect(found).toBeTruthy()
        })
        return found!
    }

    function composerFor(label: string) {
        const input = screen.getByLabelText(`Add an item to ${label}`) as HTMLInputElement
        return { input, fields: within(input.closest('[data-testid="add-item-composer"]') as HTMLElement) }
    }

    function typeAndAdd(input: HTMLInputElement, text: string) {
        fireEvent.change(input, { target: { value: text } })
        fireEvent.keyDown(input, { key: 'Enter' })
    }

    it('files a new item under the section chosen on the person card', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        const { input, fields } = composerFor("Alice's items")
        fireEvent.change(input, { target: { value: 'Trail map' } })
        fireEvent.change(fields.getByLabelText('Section'), { target: { value: 'Hiking' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        const added = await savedItem('Trail map')
        expect(added.category).toBe('Hiking')
        expect(added.personName).toBe('Alice')
    })

    it('still files into the catch-all section when no section is chosen', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        typeAndAdd(composerFor("Alice's items").input, 'Odds and ends')

        expect((await savedItem('Odds and ends')).category).toBeUndefined()
    })

    it('saves a quantity typed alongside the item', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        const { input, fields } = composerFor("Alice's items")
        fireEvent.change(input, { target: { value: 'Socks' } })
        fireEvent.change(fields.getByLabelText('Quantity'), { target: { value: '5' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        expect((await savedItem('Socks')).quantity).toBe(5)
    })

    it('adds straight into a section from that section’s own + Add button', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Add item to Hiking for Alice' }))
        typeAndAdd(composerFor('Hiking for Alice').input, 'Compass')

        const added = await savedItem('Compass')
        expect(added.category).toBe('Hiking')
        expect(added.personName).toBe('Alice')
    })

    it('opens only one in-place composer at a time', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Add item to Hiking for Alice' }))
        expect(screen.getByLabelText('Add an item to Hiking for Alice')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: 'Add item to Other for Alice' }))
        expect(screen.queryByLabelText('Add an item to Hiking for Alice')).toBeNull()
        expect(screen.getByLabelText('Add an item to Other for Alice')).toBeTruthy()
    })

    it('adds for someone with nothing in a section yet, from question view', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: 'Question View' }))

        const { input, fields } = composerFor('Hiking')
        fireEvent.change(input, { target: { value: 'Walking poles' } })
        fireEvent.change(fields.getByLabelText('Who for'), { target: { value: 'Bob' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        const added = await savedItem('Walking poles')
        expect(added.category).toBe('Hiking')
        expect(added.personName).toBe('Bob')
        expect(added.personId).toBe('p2')
    })

    it('suggests an item someone else has, and files it in the same section', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())

        const { input } = composerFor("Bob's items")
        fireEvent.change(input, { target: { value: 'ten' } })
        fireEvent.click(screen.getByRole('option', { name: /Tent/ }))
        fireEvent.keyDown(input, { key: 'Enter' })

        const added = await savedItem('Tent')
        expect(added.category).toBe('Hiking')
        expect(added.personName).toBe('Bob')
    })

    it('does not suggest what this person already has', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())

        fireEvent.change(composerFor("Alice's items").input, { target: { value: 'ten' } })
        expect(screen.queryByRole('option', { name: /Tent/ })).toBeNull()
    })
})

// ─── Keeping a big list manageable ──────────────────────────────────────────

describe('ViewPackingList folding sections away', () => {
    // A family-shaped list: Alice is done, Bob is halfway, Cara hasn't started.
    // Three sections so "collapse all" has something to say, and the list is
    // never finished by one tick — the all-packed celebration has its own rules.
    const familyList = {
        id: 'test-list-family',
        name: 'Family Trip',
        createdAt: '2026-01-01T00:00:00Z',
        items: [
            { id: 'a1', itemText: 'Passport', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', category: 'Documents', packed: true },
            { id: 'a2', itemText: 'Sunhat', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', category: 'Clothes', packed: true },
            { id: 'b1', itemText: 'Wellies', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', category: 'Clothes', packed: true },
            { id: 'b2', itemText: 'Toothbrush', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', category: 'Toiletries', packed: false },
            { id: 'c1', itemText: 'Armbands', personName: 'Cara', personId: 'p3', questionId: 'q1', optionId: 'o1', category: 'Clothes', packed: false },
            { id: 'c2', itemText: 'Teddy', personName: 'Cara', personId: 'p3', questionId: 'q1', optionId: 'o1', category: 'Other', packed: false },
        ],
    }

    function mockList(list: typeof familyList) {
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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...list, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({
            db: {
                getPackingList: vi.fn().mockResolvedValue(list),
                savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
                getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }),
            } as unknown as PackingAppDatabase,
        })
    }

    function renderList(listId = 'test-list-family') {
        return render(
            <MemoryRouter initialEntries={[`/view-list/${listId}`]}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
    }

    function checkboxFor(itemText: string) {
        return screen.getByText(itemText).closest('label')!.querySelector('input')!
    }

    beforeEach(() => {
        mockList(familyList)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('when everything in a section is packed', () => {
        it('folds a section that was already finished when the list opened', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

            expect(screen.getByRole('button', { name: /expand alice's list/i })).toBeTruthy()
        })

        it('leaves a section with items still to pack open', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

            expect(screen.getByText('Toothbrush')).toBeTruthy()
            expect(screen.getByText('Armbands')).toBeTruthy()
        })

        it('keeps the folded section on the page with its count and its celebration', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

            const header = screen.getByRole('button', { name: /expand alice's list/i })
            expect(header.textContent).toContain("Alice's Items")
            expect(header.textContent).toContain('2 / 2')
            expect(screen.getByLabelText(/all packed for alice/i)).toBeTruthy()
        })

        it('folds a section that is finished in front of the user', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

            fireEvent.click(checkboxFor('Toothbrush'))

            await waitFor(
                () => expect(screen.getByRole('button', { name: /expand bob's list/i })).toBeTruthy(),
                { timeout: 3000 },
            )
        })

        it('leaves a section the user reopened open when something else is packed', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /expand alice's list/i }))

            fireEvent.click(checkboxFor('Toothbrush'))
            await waitFor(
                () => expect(screen.getByRole('button', { name: /expand bob's list/i })).toBeTruthy(),
                { timeout: 3000 },
            )

            expect(screen.getByRole('button', { name: /collapse alice's list/i })).toBeTruthy()
        })

        it('folds a section again once it is packed back up', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))

            // Unpacking reopens Alice; packing it back folds her away again
            fireEvent.click(checkboxFor('Sunhat'))
            fireEvent.click(screen.getByRole('button', { name: 'Hide Packed' }))
            expect(screen.getByRole('button', { name: /collapse alice's list/i })).toBeTruthy()

            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
            fireEvent.click(checkboxFor('Sunhat'))
            fireEvent.click(screen.getByRole('button', { name: 'Hide Packed' }))

            await waitFor(
                () => expect(screen.getByRole('button', { name: /expand alice's list/i })).toBeTruthy(),
                { timeout: 3000 },
            )
        })
    })

    describe('showing packed items', () => {
        it('hands back the sections the page folded', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            expect(screen.getByRole('button', { name: /expand alice's list/i })).toBeTruthy()

            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))

            expect(screen.getByText('Passport')).toBeTruthy()
            expect(screen.getByRole('button', { name: /collapse alice's list/i })).toBeTruthy()
        })

        it('leaves a section the user folded by hand alone', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse cara's list/i }))

            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))

            expect(screen.getByRole('button', { name: /expand cara's list/i })).toBeTruthy()
        })
    })

    describe('collapse all / expand all', () => {
        it('folds every section', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

            fireEvent.click(screen.getByRole('button', { name: /collapse all/i }))

            expect(screen.queryByText('Toothbrush')).toBeNull()
            expect(screen.queryByText('Armbands')).toBeNull()
        })

        it('opens every section, including the ones folded automatically', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse all/i }))

            fireEvent.click(screen.getByRole('button', { name: /expand all/i }))

            expect(screen.getByText('Toothbrush')).toBeTruthy()
            expect(screen.getByRole('button', { name: /collapse alice's list/i })).toBeTruthy()
        })

        it('does not re-fold a finished section after the user opens everything', async () => {
            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse all/i }))
            fireEvent.click(screen.getByRole('button', { name: /expand all/i }))

            fireEvent.click(checkboxFor('Armbands'))
            await new Promise(resolve => setTimeout(resolve, 1200))

            expect(screen.getByRole('button', { name: /collapse alice's list/i })).toBeTruthy()
        })

        it('is not offered when the list has only one section', async () => {
            mockList({
                ...familyList,
                id: 'test-list-solo',
                items: [familyList.items[4]],
            })
            renderList('test-list-solo')
            await waitFor(() => expect(screen.getByText('Armbands')).toBeTruthy())

            expect(screen.queryByRole('button', { name: /collapse all/i })).toBeNull()
        })
    })

    describe('remembering how the list was left', () => {
        it('reopens with the sections the user folded still folded', async () => {
            const { unmount } = renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse cara's list/i }))
            unmount()

            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

            expect(screen.getByRole('button', { name: /expand cara's list/i })).toBeTruthy()
        })

        it('reopens in the view mode the user chose', async () => {
            const { unmount } = renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /question view/i }))
            unmount()

            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

            expect(screen.getByRole('button', { name: /question view/i }).getAttribute('aria-pressed')).toBe('true')
        })

        it('reopens still showing packed items', async () => {
            const { unmount } = renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
            unmount()

            renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

            expect(screen.getByText('Passport')).toBeTruthy()
        })

        it('reopens a folded group inside a section still folded', async () => {
            const { unmount } = renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse toiletries/i }))
            expect(screen.queryByText('Toothbrush')).toBeNull()
            unmount()

            renderList()
            await waitFor(() => expect(screen.getByText('Armbands')).toBeTruthy())

            expect(screen.queryByText('Toothbrush')).toBeNull()
        })

        it('does not carry one list\'s folded sections onto another', async () => {
            const { unmount } = renderList()
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse cara's list/i }))
            unmount()

            mockList({ ...familyList, id: 'test-list-other' })
            renderList('test-list-other')
            await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

            expect(screen.getByRole('button', { name: /collapse cara's list/i })).toBeTruthy()
        })
    })
})

describe('ViewPackingList opening a long list for the first time', () => {
    // Six people so the list has plenty to fold, and 36 items so it clears the
    // "long enough to arrive as a wall" threshold.
    const people = ['Alice', 'Bob', 'Cara', 'Dev', 'Eve', 'Finn']
    function bigList(id: string, itemsPerPerson: number) {
        return {
            id,
            name: 'Big Trip',
            createdAt: '2026-01-01T00:00:00Z',
            items: people.flatMap((person, p) =>
                Array.from({ length: itemsPerPerson }, (_, i) => ({
                    id: `${person}-${i}`,
                    itemText: `${person} item ${i}`,
                    personName: person,
                    personId: `p${p}`,
                    questionId: 'q1',
                    optionId: 'o1',
                    category: 'Clothes',
                    packed: false,
                })),
            ),
        }
    }

    function mockList(list: ReturnType<typeof bigList>) {
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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...list, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({
            db: {
                getPackingList: vi.fn().mockResolvedValue(list),
                savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
                getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }),
            } as unknown as PackingAppDatabase,
        })
    }

    function renderList(listId: string) {
        return render(
            <MemoryRouter initialEntries={[`/view-list/${listId}`]}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
    }

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('opens a long list folded', async () => {
        mockList(bigList('big-1', 6))
        renderList('big-1')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())

        expect(screen.queryByText('Alice item 0')).toBeNull()
        expect(screen.getByRole('button', { name: /expand alice's list/i })).toBeTruthy()
    })

    it('keeps every section and its count on the page', async () => {
        mockList(bigList('big-2', 6))
        renderList('big-2')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())

        for (const person of people) {
            expect(screen.getByRole('button', { name: new RegExp(`expand ${person}'s list`, 'i') }).textContent)
                .toContain('0 / 6')
        }
    })

    it('says why the list arrived folded, and offers the way out', async () => {
        mockList(bigList('big-3', 6))
        renderList('big-3')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())

        const note = screen.getByTestId('folded-on-open-note')
        expect(note.textContent).toContain('all 6 sections start folded')

        fireEvent.click(within(note).getByRole('button', { name: /expand all/i }))

        expect(screen.getByText('Alice item 0')).toBeTruthy()
        expect(screen.queryByTestId('folded-on-open-note')).toBeNull()
    })

    it('drops the note as soon as the user opens a section themselves', async () => {
        mockList(bigList('big-4', 6))
        renderList('big-4')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /expand alice's list/i }))

        expect(screen.queryByTestId('folded-on-open-note')).toBeNull()
    })

    it('leaves a short list open', async () => {
        // Six people, one item each — plenty of sections, but no wall
        mockList(bigList('small-1', 1))
        renderList('small-1')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())

        expect(screen.getByText('Alice item 0')).toBeTruthy()
        expect(screen.queryByTestId('folded-on-open-note')).toBeNull()
    })

    it('leaves a long list with a single section open, having nothing to fold into', async () => {
        const list = bigList('solo-1', 6)
        mockList({ ...list, items: list.items.map(item => ({ ...item, personName: 'Alice', personId: 'p0' })) })
        renderList('solo-1')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())

        expect(screen.getByText('Alice item 0')).toBeTruthy()
    })

    it('does not fold a list the user has opened before', async () => {
        mockList(bigList('big-5', 6))
        const { unmount } = renderList('big-5')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())
        fireEvent.click(within(screen.getByTestId('folded-on-open-note')).getByRole('button', { name: /expand all/i }))
        unmount()

        renderList('big-5')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())

        // Their arrangement wins, even though it matches the plain defaults
        expect(screen.getByText('Alice item 0')).toBeTruthy()
        expect(screen.queryByTestId('folded-on-open-note')).toBeNull()
    })

    it('reopens folded if that is how the user left it', async () => {
        mockList(bigList('big-6', 6))
        const { unmount } = renderList('big-6')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())
        unmount()

        renderList('big-6')
        await waitFor(() => expect(screen.getByText("Alice's Items")).toBeTruthy())

        expect(screen.queryByText('Alice item 0')).toBeNull()
        // Second time around it is their arrangement, not something to explain
        expect(screen.queryByTestId('folded-on-open-note')).toBeNull()
    })
})

describe('ViewPackingList contextual sign-in to share', () => {
    beforeEach(() => {
        sessionStorage.clear()
        mockUsePodSync.mockReturnValue({ saveToPod: vi.fn() })
        mockUseSyncCoordinator.mockReturnValue({
            syncingFromPod: false,
            handleSyncSuccess: vi.fn(),
            handleSyncError: vi.fn(),
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...testPackingList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
        vi.mocked(SharePackingListModal).mockClear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function mockLoggedOut() {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: mockLogin,
            logout: vi.fn(),
        } as unknown as ReturnType<typeof useSolidPod>)
    }

    function mockLoggedIn() {
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: true,
            session: { fetch: vi.fn(), info: { isLoggedIn: true, webId: 'https://me.example/profile#me' } },
            webId: 'https://me.example/profile#me',
            isLoading: false,
            login: mockLogin,
            logout: vi.fn(),
        } as unknown as ReturnType<typeof useSolidPod>)
    }

    const mockLogin = vi.fn()

    it('offers Share to a logged-out user rather than hiding it', async () => {
        mockLoggedOut()
        renderComponent()

        const shareButton = await screen.findByRole('button', { name: 'Share' })
        expect((shareButton as HTMLButtonElement).disabled).toBe(false)
    })

    it('frames the sign-in ask around sharing when a logged-out user shares', async () => {
        mockLoggedOut()
        renderComponent()

        fireEvent.click(await screen.findByRole('button', { name: 'Share' }))

        expect(screen.getByText(/sign in to share this list/i)).toBeTruthy()
        expect(screen.getByRole('button', { name: /sign in to share/i })).toBeTruthy()
    })

    it('remembers the share the user was attempting when they sign in', async () => {
        mockLoggedOut()
        renderComponent()

        fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
        fireEvent.click(screen.getByRole('button', { name: /sign in to share/i }))
        fireEvent.click(screen.getByLabelText('Inrupt PodSpaces'))

        expect(mockLogin).toHaveBeenCalledWith('https://login.inrupt.com')
        expect(getPendingSignInAction()).toEqual({ type: 'share', listId: 'test-list-1' })
    })

    it('drops the prompt without remembering anything when the user backs out', async () => {
        mockLoggedOut()
        renderComponent()

        fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
        fireEvent.click(screen.getByRole('button', { name: /not now/i }))

        await waitFor(() => expect(screen.queryByText(/sign in to share this list/i)).toBeNull())
        expect(getPendingSignInAction()).toBeNull()
    })

    it('resumes the share once the user comes back signed in', async () => {
        setPendingSignInAction({ type: 'share', listId: 'test-list-1' })
        mockLoggedIn()

        renderComponent()

        await waitFor(() =>
            expect(vi.mocked(SharePackingListModal).mock.calls.some(([props]) => props.isOpen)).toBe(true)
        )
        // Consumed, so a later visit does not pop the dialog again
        expect(getPendingSignInAction()).toBeNull()
    })

    it('leaves a share intended for another list alone', async () => {
        setPendingSignInAction({ type: 'share', listId: 'some-other-list' })
        mockLoggedIn()

        renderComponent()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())
        expect(vi.mocked(SharePackingListModal).mock.calls.every(([props]) => !props.isOpen)).toBe(true)
        expect(getPendingSignInAction()).toEqual({ type: 'share', listId: 'some-other-list' })
    })
})
