import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
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
    isRetryablePodUrlFailure: (error: unknown) =>
        error instanceof Error && error.name === 'PodUrlUnavailableError'
        && (error as { reason?: string }).reason !== 'no-storage-declared',
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

/**
 * A row of the category grid, by the button carrying its name.
 *
 * Not `getByText`: a row's name is split so that its last word can hold on to
 * the chevron (see `splitLastWord`), so any name of more than one word is more
 * than one text node.
 */
function row(itemText: string) {
    return screen.getByRole('button', { name: `Edit ${itemText}` })
}

/** The chip that packs one person's copy of an item — the grid's checkbox. */
function chipFor(itemText: string, person: string) {
    return screen.getByRole('checkbox', { name: `${itemText} for ${person}` })
}

// The list view remembers how it was left (folded sections, whether packed
// items are showing) per list id in localStorage. Tests reuse the same
// ids, so without this each one inherits the last one's folded sections.
beforeEach(() => {
    localStorage.clear()
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
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
        expect(screen.getAllByRole('button', { name: /Collapse Essentials/i }).length).toBeGreaterThan(0)
        expect(screen.getByRole('button', { name: /Collapse Hiking/i })).toBeTruthy()
    })

    it('shows items without category under "Other"', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Legacy item' })).toBeTruthy())
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
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
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

    it('gives a category one card, with everyone who needs something in it on it', async () => {
        // Two people both have an Essentials item. The old person view gave the
        // category a heading inside each of their cards; the grid writes the
        // name once and puts the people across it.
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy())

        expect(screen.getAllByRole('button', { name: /Collapse Essentials/i }).length).toBe(1)
        expect(screen.getByRole('checkbox', { name: 'Toothbrush for Alice' })).toBeTruthy()
        expect(screen.getByRole('checkbox', { name: 'Nappies for Bob' })).toBeTruthy()
    })
})

describe('ViewPackingList category grid', () => {
    // Alice and Bob both need a toothbrush; only Bob has nappies. One name, two
    // people, is the whole reason the grid exists.
    const gridList = {
        id: 'test-list-grid',
        name: 'Grid Trip',
        createdAt: '2026-01-01T00:00:00Z',
        items: [
            { id: 'tb-a', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false, category: 'Essentials', order: 0 },
            { id: 'tb-b', itemText: 'Toothbrush', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', packed: false, category: 'Essentials', order: 0 },
            { id: 'np-b', itemText: 'Nappies', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', packed: false, category: 'Essentials', order: 1 },
        ],
    }

    let db: { getPackingList: ReturnType<typeof vi.fn>; savePackingList: ReturnType<typeof vi.fn> }

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
            saveWithSyncPrevention: vi.fn(),
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function renderGrid(list: typeof gridList = gridList) {
        db = {
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
        await waitFor(() => expect(screen.getAllByText('Toothbrush').length).toBeGreaterThan(0))
    }

    function checkbox(name: string): HTMLInputElement {
        return screen.getByRole('checkbox', { name }) as HTMLInputElement
    }

    async function savedList() {
        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        return db.savePackingList.mock.calls.at(-1)![0] as { items: PackingListItem[]; deletedItems?: PackingListItem[] }
    }

    it('writes a name shared by two people once, with a checkbox each', async () => {
        await renderGrid()

        expect(screen.getAllByText('Toothbrush')).toHaveLength(1)
        expect(checkbox('Toothbrush for Alice')).toBeTruthy()
        expect(checkbox('Toothbrush for Bob')).toBeTruthy()
    })

    describe('hiding packed items', () => {
        it('keeps a half-packed row, so a packed cell never reads as one nobody needs', async () => {
            await renderGrid()

            fireEvent.click(checkbox('Toothbrush for Alice'))

            // The row stays whole: Alice's cell is ticked and still on screen,
            // where an empty cell would have said "Alice doesn't need one".
            await waitFor(() => expect(checkbox('Toothbrush for Alice').checked).toBe(true))
            expect(checkbox('Toothbrush for Bob')).toBeTruthy()
        })

        it('takes the row away once everyone on it is packed', async () => {
            await renderGrid()

            fireEvent.click(checkbox('Toothbrush for Alice'))
            fireEvent.click(checkbox('Toothbrush for Bob'))

            await waitFor(() => expect(screen.queryByText('Toothbrush')).toBeNull())
            expect(checkbox('Nappies for Bob')).toBeTruthy()
        })

        it('counts what it is actually holding back, not every packed item', async () => {
            await renderGrid()

            fireEvent.click(checkbox('Toothbrush for Alice'))
            fireEvent.click(checkbox('Toothbrush for Bob'))

            // Two items hidden — Alice's and Bob's toothbrushes — and not the
            // three a person-view count would have claimed.
            await waitFor(() => expect(screen.getByText(/2 packed items hidden/)).toBeTruthy())
        })
    })

    describe('the "who needs this?" panel', () => {
        const openPanel = async (label: string) => {
            fireEvent.click(screen.getByRole('button', { name: `Edit ${label}` }))
            await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
            return within(screen.getByRole('dialog'))
        }

        it('opens from the item name and says who has it', async () => {
            await renderGrid()

            const panel = await openPanel('Nappies')
            expect((panel.getByRole('checkbox', { name: 'Bob needs Nappies' }) as HTMLInputElement).checked).toBe(true)
            expect((panel.getByRole('checkbox', { name: 'Alice needs Nappies' }) as HTMLInputElement).checked).toBe(false)
        })

        it('opens from a gap in the row, where "Cara needs one too" is thought', async () => {
            await renderGrid()

            // Pointer-only, and hidden from screen readers: the row's own button
            // is the same door and it is the one in the tab order.
            fireEvent.click(screen.getByTitle("Alice doesn't need this — open to change"))

            await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
            expect(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Alice needs Nappies' })).toBeTruthy()
        })

        it('adds the item for somebody who does not have it', async () => {
            await renderGrid()

            const panel = await openPanel('Nappies')
            fireEvent.click(panel.getByRole('checkbox', { name: 'Alice needs Nappies' }))

            const saved = await savedList()
            const added = saved.items.findLast(item => item.itemText === 'Nappies')!
            expect(added.personName).toBe('Alice')
            expect(added.personId).toBe('p1')
            expect(added.category).toBe('Essentials')
        })

        it('takes it off one person without touching the others', async () => {
            await renderGrid()

            const panel = await openPanel('Toothbrush')
            fireEvent.click(panel.getByRole('checkbox', { name: 'Bob needs Toothbrush' }))

            const saved = await savedList()
            expect(saved.items.map(item => item.id)).toEqual(['tb-a', 'np-b'])
            // Deleting an item the question set put there is remembered, so the
            // user can be asked about it next time
            expect(saved.deletedItems?.map(item => item.id)).toEqual(['tb-b'])
        })

        it('renames every copy at once, because one item spelled two ways is a bug', async () => {
            await renderGrid()

            const panel = await openPanel('Toothbrush')
            const field = panel.getByLabelText('Name') as HTMLInputElement
            fireEvent.change(field, { target: { value: 'Tooth brush' } })
            fireEvent.keyDown(field, { key: 'Enter' })

            const saved = await savedList()
            expect(saved.items.filter(item => item.itemText === 'Tooth brush').map(item => item.id))
                .toEqual(['tb-a', 'tb-b'])
        })

        it('stays open on the row it was opened on after a rename', async () => {
            await renderGrid()

            const panel = await openPanel('Toothbrush')
            const field = panel.getByLabelText('Name') as HTMLInputElement
            fireEvent.change(field, { target: { value: 'Tooth brush' } })
            fireEvent.keyDown(field, { key: 'Enter' })

            await waitFor(() => expect(
                within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Alice needs Tooth brush' }),
            ).toBeTruthy())
        })

        it('sets a quantity for one person only', async () => {
            await renderGrid()

            const panel = await openPanel('Toothbrush')
            const quantity = panel.getByLabelText('Quantity for Alice')
            fireEvent.change(quantity, { target: { value: '3' } })
            fireEvent.blur(quantity)

            const saved = await savedList()
            expect(saved.items.find(item => item.id === 'tb-a')!.quantity).toBe(3)
            expect(saved.items.find(item => item.id === 'tb-b')!.quantity).toBeUndefined()
        })

        it('marks one person\'s copy as last minute, leaving the other where it is', async () => {
            await renderGrid()

            const panel = await openPanel('Toothbrush')
            fireEvent.click(panel.getByRole('button', { name: /Mark Alice's Toothbrush as a last minute item/i }))

            const saved = await savedList()
            expect(saved.items.find(item => item.id === 'tb-a')!.lastMinute).toBe(true)
            expect(saved.items.find(item => item.id === 'tb-b')!.lastMinute).toBeUndefined()
        })

        it('removes the whole row once the removal is confirmed, naming who it covers', async () => {
            await renderGrid()

            const panel = await openPanel('Toothbrush')
            fireEvent.click(panel.getByRole('button', { name: 'Remove for all 2' }))

            await waitFor(() => expect(screen.getByText('Remove Toothbrush for Alice, Bob?')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))

            const saved = await savedList()
            expect(saved.items.map(item => item.id)).toEqual(['np-b'])
        })
    })

    it('gives the unassigned items a place of their own, last', async () => {
        await renderGrid({
            ...gridList,
            items: [
                ...gridList.items,
                { id: 'tr-x', itemText: 'Torch', personName: '', personId: '', questionId: '', optionId: '', packed: false, category: 'Essentials', order: 2 },
            ],
        })

        const key = within(screen.getByTestId('people-key'))
        expect(['Alice', 'Bob', 'Unassigned'].map(name => !!key.queryByText(name)))
            .toEqual([true, true, true])
        expect(checkbox('Torch for Unassigned')).toBeTruthy()
    })

    it('lays the last minute card out as a grid too', async () => {
        await renderGrid({
            ...gridList,
            items: gridList.items.map(item => item.id === 'tb-a' ? { ...item, lastMinute: true } : item),
        })

        const lastMinute = screen.getAllByTestId('list-section').find(section =>
            within(section).queryByRole('button', { name: /Collapse the last minute items list/i }))!
        expect(within(lastMinute).getByRole('checkbox', { name: 'Toothbrush for Alice' })).toBeTruthy()
    })

    describe('when there are more people than fit beside the names', () => {
        // Seven people: the columns stop paying for themselves, so the item
        // takes a line of its own and the people wrap underneath it.
        const crowd = ['Ann', 'Ben', 'Cass', 'Dev', 'Eve', 'Fin', 'Gil']
        const crowdedList = {
            id: 'test-list-crowd',
            name: 'Big Family',
            createdAt: '2026-01-01T00:00:00Z',
            items: [
                ...crowd.map((name, index) => ({
                    id: `tb-${index}`,
                    itemText: 'Toothbrush',
                    personName: name,
                    personId: `p${index}`,
                    questionId: 'q1',
                    optionId: 'o1',
                    packed: false,
                    category: 'Essentials',
                    order: 0,
                })),
                { id: 'np-1', itemText: 'Nappies', personName: 'Ben', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false, category: 'Essentials', order: 1 },
            ],
        }

        beforeEach(() => {
            // The columns only give way where there is no room for them, and
            // the test environment is a desktop unless it is told otherwise.
            vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }) as unknown as MediaQueryList)
        })

        const renderCrowd = () => renderGrid(crowdedList as typeof gridList)

        it('drops the columns and gives every person a chip', async () => {
            await renderCrowd()

            expect(screen.queryByRole('columnheader')).toBeNull()
            for (const name of crowd) {
                expect(checkbox(`Toothbrush for ${name}`)).toBeTruthy()
            }
        })

        it('keeps a place for someone who does not need it, so the chips still line up', async () => {
            await renderCrowd()

            // Ben is the only one with nappies; the other six keep their place
            expect(checkbox('Nappies for Ben')).toBeTruthy()
            expect(screen.queryByRole('checkbox', { name: 'Nappies for Ann' })).toBeNull()
            expect(screen.getByTitle("Ann doesn't need this — open to change")).toBeTruthy()
        })

        it('packs from a chip', async () => {
            await renderCrowd()

            fireEvent.click(checkbox('Toothbrush for Cass'))

            await waitFor(() => expect(checkbox('Toothbrush for Cass').checked).toBe(true))
            expect(checkbox('Toothbrush for Dev').checked).toBe(false)
        })

        it('names all seven in the key, however the chips wrap', async () => {
            await renderCrowd()

            const key = within(screen.getByTestId('people-key'))
            expect(crowd.map(name => !!key.queryByText(name))).toEqual(crowd.map(() => true))
        })
    })

    describe('however wide the screen', () => {
        beforeEach(() => {
            vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
                // Narrower than the sm breakpoint, and no reduced-motion preference
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }) as unknown as MediaQueryList)
        })

        it('names everyone in the key, since the chips themselves carry initials', async () => {
            await renderGrid()

            // The chips still name their person, so nothing is lost to a screen
            // reader by their showing an initial
            expect(checkbox('Toothbrush for Alice')).toBeTruthy()
            const key = within(screen.getByTestId('people-key'))
            expect(key.getByText('Alice')).toBeTruthy()
            expect(key.getByText('Bob')).toBeTruthy()
        })
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
    const checkPassport = () => fireEvent.click(chipFor('Passport', 'Alice'))

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

    it("shows a person's own progress on their chip once they are the one being packed for", async () => {
        renderProgressComponent()
        await waitFor(() => expect(row('Sunscreen')).toBeTruthy())

        // Unselected chips carry no numbers: every chip carrying them makes the
        // strip twice as long, and a chip that grows when pressed moves the one
        // beside it out from under the finger going there next.
        expect(screen.getByRole('button', { name: /^Alice/ }).textContent).not.toContain('1/2')

        fireEvent.click(screen.getByRole('button', { name: /^Alice/ }))

        expect(screen.getByRole('button', { name: /^Alice/ }).textContent).toContain('1/2')
    })

    it('counts every item in a section, not just the ones on screen', async () => {
        renderProgressComponent()
        await waitFor(() => expect(row('Sunscreen')).toBeTruthy())

        // The packed items are hidden, but the section is still half done —
        // showing "0 / 2" there would read as a section barely started.
        expect(screen.getByRole('button', { name: /collapse other list/i }).textContent).toContain('2 / 4')
    })

    it('counts only the filtered person once the list is narrowed to them', async () => {
        renderProgressComponent()
        await waitFor(() => expect(row('Sunscreen')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /^Alice/ }))

        // And says whose: an unqualified "1 / 2" beside a page total of "2 / 4"
        // is a number with no referent.
        expect(screen.getByRole('button', { name: /collapse other list/i }).textContent)
            .toContain('1 / 2 for Alice')
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
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Item 0' })).toBeTruthy())

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
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Item 0' })).toBeTruthy())
        keepPackedItemsVisible()

        toggleItems(0, 4)

        await waitFor(() => expect(screen.getByTestId('packing-progress-fill').style.width).toBe('50%'))
    })

    it('says nothing encouraging before the first milestone', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Item 0' })).toBeTruthy())
        keepPackedItemsVisible()

        toggleItems(0, 1)

        await waitFor(() => expect(screen.getByTestId('packing-progress-fill').style.width).toBe('13%'))
        expect(screen.queryByTestId('progress-milestone')).toBeNull()
    })

    it('cheers the user on at each milestone', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Item 0' })).toBeTruthy())
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
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Item 0' })).toBeTruthy())
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
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Item 0' })).toBeTruthy())
        keepPackedItemsVisible()

        toggleItems(0, 2)
        await waitFor(() => expect(screen.getByTestId('progress-milestone')).toBeTruthy())

        toggleItems(0, 2)

        await waitFor(() => expect(screen.getByTestId('packing-progress-fill').style.width).toBe('0%'))
        expect(screen.queryByTestId('progress-milestone')).toBeNull()
    })

    it('hands over to the all-packed treatment at 100%', async () => {
        setup(eightItemList)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Item 0' })).toBeTruthy())
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
            // The name's own span, inside the button that opens the row panel
            expect(row('Passport').querySelector('span')!.className).toContain('line-through')
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
            const added = screen.getAllByTestId(/^grid-cell-/).find(
                cell => cell.getAttribute('title') === 'Sunscreen for Alice',
            )
            expect(added!.className).toContain('ring-green-400')
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
        await waitFor(() => expect(row('Socks')).toBeTruthy())

        // Quantities live in the row's panel, reached through its name
        fireEvent.click(row('Socks'))
        const quantityInput = screen.getByRole('spinbutton', { name: /quantity for alice/i })
        expect((quantityInput as HTMLInputElement).value).toBe('3')

        fireEvent.change(quantityInput, { target: { value: '5' } })
        fireEvent.keyDown(quantityInput, { key: 'Enter' })
        fireEvent.blur(quantityInput)

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
        await waitFor(() => expect(row('Socks')).toBeTruthy())

        // Quantities live in the row's panel, reached through its name
        fireEvent.click(row('Socks'))
        const quantityInput = screen.getByRole('spinbutton', { name: /quantity for alice/i })
        fireEvent.change(quantityInput, { target: { value: '' } })
        fireEvent.keyDown(quantityInput, { key: 'Enter' })
        fireEvent.blur(quantityInput)

        // The panel drops the key rather than storing an undefined against it
        await waitFor(() => {
            const saved = db.savePackingList.mock.calls.at(-1)![0] as { items: PackingListItem[] }
            const socks = saved.items.find(item => item.id === 'item-socks')!
            expect(socks).not.toHaveProperty('quantity')
        })
    })
})

describe('ViewPackingList expandable sections', () => {
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

    it('sections are expanded by default', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy())
        expect(screen.getByRole('button', { name: 'Edit Nappies' })).toBeTruthy()
    })

    it('clicking a section header collapses that section', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /collapse essentials list/i }))

        expect(screen.queryByRole('button', { name: 'Edit Toothbrush' })).toBeNull()
    })

    it('collapsing one section does not affect another', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Tent' })).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /collapse essentials list/i }))

        expect(screen.getByRole('button', { name: 'Edit Tent' })).toBeTruthy()
    })

    it('clicking a collapsed section header expands it again', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /collapse essentials list/i }))
        fireEvent.click(screen.getByRole('button', { name: /expand essentials list/i }))

        expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy()
    })

    it('hides the add-item input when the section is collapsed', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy())
        const before = screen.getAllByPlaceholderText('Add new item...').length

        fireEvent.click(screen.getByRole('button', { name: /collapse essentials list/i }))

        expect(screen.getAllByPlaceholderText('Add new item...').length).toBeLessThan(before)
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

    it('says the list is still on its way rather than missing while the login sync runs', async () => {
        const { getPackingList } = renderMissingLocally({ loginSyncInProgress: true })

        await waitFor(() => expect(getPackingList).toHaveBeenCalledWith('test-list-1'))
        expect(screen.getByRole('status').textContent).toContain('Loading packing list...')
        expect(screen.queryByText('Packing list not found')).toBeNull()
    })

    it('says the list is not there once the login sync has finished', async () => {
        const { getPackingList } = renderMissingLocally({ loginSyncInProgress: false })

        await waitFor(() => expect(getPackingList).toHaveBeenCalled())
        await waitFor(() => expect(screen.getByText('Packing list not found')).toBeTruthy())
    })

    it('looks again when the login sync lands something it had not seen', async () => {
        const getPackingList = vi.fn().mockRejectedValue({ name: 'not_found', message: 'Packing list not found' })
        const db = { ...makeDb(), getPackingList } as unknown as PackingAppDatabase
        mockUseDatabase.mockReturnValue({ db, loginSyncVersion: 0, loginSyncInProgress: true })

        const { rerender } = render(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
        await waitFor(() => expect(getPackingList).toHaveBeenCalledTimes(1))

        getPackingList.mockResolvedValue(testPackingList)
        mockUseDatabase.mockReturnValue({ db, loginSyncVersion: 1, loginSyncInProgress: false })
        rerender(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )

        await waitFor(() => expect(screen.getByText('Test Trip')).toBeTruthy())
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

// Opening a list the device already holds must not wait on the pod. The login
// sync walks the whole pod — every list, the question set, the tombstones — and
// on a slow connection that is seconds of staring at a skeleton for data the
// page already has locally.

describe('ViewPackingList while the pod sync is still running', () => {
    function renderWithSync(loginSyncInProgress: boolean, db = makeDb()) {
        mockUseDatabase.mockReturnValue({
            db: db as unknown as PackingAppDatabase,
            loginSyncVersion: 0,
            loginSyncInProgress,
        })
        return { ...renderComponent(), db }
    }

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
    })

    it('shows a locally stored list without waiting for the pod', async () => {
        renderWithSync(true)

        expect(await screen.findByText('Test Trip')).toBeTruthy()
        expect(screen.queryByText('Loading packing list...')).toBeNull()
    })

    it('flags that the pod is still being read', async () => {
        renderWithSync(true)

        await screen.findByText('Test Trip')
        expect(screen.getByTestId('pod-sync-indicator')).toBeTruthy()
    })

    it('drops the flag once the pod has been read', async () => {
        renderWithSync(false)

        await screen.findByText('Test Trip')
        expect(screen.queryByTestId('pod-sync-indicator')).toBeNull()
    })

    // The guard above must not turn into "this page has loaded something":
    // moving between two lists keeps the same component mounted, and the second
    // one has to be read.
    it('reads the next list when the route moves to a different one', async () => {
        const secondList = { ...testPackingList, id: 'test-list-2', name: 'Second Trip' }
        const getPackingList = vi.fn(async (listId: string) => (
            listId === 'test-list-2' ? secondList : testPackingList
        ))
        mockUseDatabase.mockReturnValue({
            db: { ...makeDb(), getPackingList } as unknown as PackingAppDatabase,
            loginSyncVersion: 0,
            loginSyncInProgress: false,
        })

        function GoToSecondList() {
            const navigate = useNavigate()
            return <button onClick={() => navigate('/view-list/test-list-2')}>go to second</button>
        }

        render(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <GoToSecondList />
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
        await screen.findByText('Test Trip')

        fireEvent.click(screen.getByText('go to second'))

        expect(await screen.findByText('Second Trip')).toBeTruthy()
    })

    // Once the list is on screen the per-list pod poll owns reconciliation: it
    // merges through useSyncCoordinator, which preserves focus and in-flight
    // edits. A raw re-read would reset the form under the user's fingers.
    it('leaves the list on screen alone when the login sync lands', async () => {
        const db = makeDb()
        const { rerender } = renderWithSync(true, db)
        await screen.findByText('Test Trip')
        expect(db.getPackingList).toHaveBeenCalledTimes(1)

        mockUseDatabase.mockReturnValue({
            db: db as unknown as PackingAppDatabase,
            loginSyncVersion: 1,
            loginSyncInProgress: false,
        })
        rerender(
            <MemoryRouter initialEntries={['/view-list/test-list-1']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )

        await waitFor(() => expect(screen.queryByTestId('pod-sync-indicator')).toBeNull())
        expect(db.getPackingList).toHaveBeenCalledTimes(1)
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

describe('ViewPackingList shared (communal) items', () => {
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
        // By the row's button rather than by its text: a row's name is split so
        // its last word can hold on to the chevron — see `splitLastWord`.
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Sleeping bag' })).toBeTruthy())
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

        // By the row's button rather than by its text: a row's name is split so
        // its last word can hold on to the chevron — see `splitLastWord`.
        expect(screen.queryByText('Shared Items')).toBeNull()
        expect(within(card('Camping')).getByRole('button', { name: 'Edit Tent' })).toBeTruthy()
        expect(within(card('Camping')).getByRole('button', { name: 'Edit Sleeping bag' })).toBeTruthy()
        expect(within(card('Essentials')).getByRole('button', { name: 'Edit First aid kit' })).toBeTruthy()
    })

    it('gives a shared item one checkbox for the whole group, ahead of the rest', async () => {
        await renderInQuestionView()

        const camping = within(card('Camping'))
        expect(camping.getByRole('checkbox', { name: 'Tent for the whole group' })).toBeTruthy()
        // No column belongs to it, and it comes first — the shared card's place
        // in person view, kept
        expect(camping.getAllByTestId('grid-row')[0].textContent).toContain('Tent')
        expect(camping.getByText('👥 Shared')).toBeTruthy()
    })

    it('counts shared items in the section total', async () => {
        await renderInQuestionView()

        const camping = within(card('Camping'))
        expect(camping.getByRole('button', { name: /collapse camping list/i }).textContent).toContain('0 / 2')
    })

    it('keeps a shared item apart from someone\'s own copy of the same thing', async () => {
        await renderInQuestionView({
            ...communalPackingList,
            items: [
                ...communalPackingList.items,
                { id: 'item-a2', itemText: 'Tent', personName: 'Alice', personId: 'p1', questionId: 'q2', optionId: 'o2', packed: false, category: 'Camping' },
            ],
        })

        const camping = within(card('Camping'))
        expect(camping.getByRole('checkbox', { name: 'Tent for the whole group' })).toBeTruthy()
        expect(camping.getByRole('checkbox', { name: 'Tent for Alice' })).toBeTruthy()
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

    it('offers no separate shared card to reveal — a shared item belongs to its section', async () => {
        const listWithoutCommunal = { ...communalPackingList, items: communalPackingList.items.filter(i => !i.communal) }
        await renderInQuestionView(listWithoutCommunal)

        expect(screen.queryByRole('button', { name: /add shared items/i })).toBeNull()
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
            { id: 'a3', itemText: 'Comb', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', category: 'Toiletries', packed: true },
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

    it('keeps a fully packed section visible while packed items are hidden', async () => {
        renderList()
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        expect(screen.getByRole('button', { name: /(expand|collapse) documents list/i })).toBeTruthy()
    })

    it('celebrates a section whose items are all packed', async () => {
        renderList()
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        expect(screen.getByLabelText(/all packed for documents/i)).toBeTruthy()
    })

    it('does not celebrate a section with items still to pack', async () => {
        renderList()
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        expect(screen.queryByLabelText(/all packed for toiletries/i)).toBeNull()
    })

    it('celebrates a section as soon as its last item is checked', async () => {
        renderList()
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
        expect(screen.queryByLabelText(/all packed for toiletries/i)).toBeNull()

        // Toothbrush is the only unpacked item, so the only visible checkbox
        fireEvent.click(screen.getAllByRole('checkbox')[0])

        await waitFor(() => expect(screen.getByLabelText(/all packed for toiletries/i)).toBeTruthy())
    })

    it('celebrates a card finished for whoever is being packed for', async () => {
        // Alice's comb is packed and Bob's toothbrush isn't, so Toiletries is
        // unfinished for the trip. Packing Alice's bag it is done — what Bob
        // still owes is not part of the question being asked.
        renderList()
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        expect(screen.queryByLabelText(/all packed for toiletries/i)).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /^Alice/ }))

        expect(screen.getByLabelText(/all packed for toiletries for alice/i)).toBeTruthy()
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
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        expect(screen.queryByTestId('completion-confetti')).toBeNull()
    })

    it('fires confetti when the last item is checked', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        await waitFor(() => expect(screen.getByTestId('completion-confetti')).toBeTruthy())
    })

    it('does not fire confetti when opening a list that was already packed', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByText('Nearly Done Trip')).toBeTruthy())

        expect(screen.queryByTestId('completion-confetti')).toBeNull()
    })

    it('folds the cards away once everything is packed', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        await waitFor(() => expect(screen.queryByTestId('list-section')).toBeNull())
    })

    it('leaves the celebration banner standing when the cards fold away', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        await waitFor(() => expect(screen.queryByTestId('list-section')).toBeNull())
        expect(screen.getByText("You're all packed!")).toBeTruthy()
    })

    it('opens an already-packed list with the cards already folded away', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByText("You're all packed!")).toBeTruthy())
        // The banner arrives first and the cards fold out from under it
        await waitFor(() => expect(screen.queryByTestId('list-section')).toBeNull())
    })

    it('brings the cards back when packed items are shown', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByText("You're all packed!")).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))

        expect(screen.getByTestId('list-section')).toBeTruthy()
        expect(row('Passport')).toBeTruthy()
    })

    it('hides the "packed items hidden" nag once everything is packed', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByText("You're all packed!")).toBeTruthy())

        expect(screen.queryByText(/packed items? hidden/i)).toBeNull()
    })

    it('holds the banner back while the cards are still folding away', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getAllByRole('checkbox')[0])

        // Confetti and the fold-away start in the same render, so at this point
        // the stage is still being cleared and the banner shouldn't have arrived
        await waitFor(() => expect(screen.getByTestId('completion-confetti')).toBeTruthy())
        expect(screen.queryByTestId('completion-banner')).toBeNull()
    })

    it('rises the banner in once the cards have gone', async () => {
        setup(oneItemLeftList)
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

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
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        // Nothing folds away in this mode, so there is no stage to clear
        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
        fireEvent.click(chipFor('Toothbrush', 'Bob'))

        await waitFor(() => expect(screen.getByTestId('completion-banner')).toBeTruthy())
        expect(screen.getByTestId('completion-banner').className).not.toContain('celebration-banner-rising')
    })

    it('restores the cards if an item is unpacked again', async () => {
        setup(fullyPackedList)
        await waitFor(() => expect(screen.getByText("You're all packed!")).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
        fireEvent.click(chipFor('Passport', 'Alice'))
        fireEvent.click(screen.getByRole('button', { name: 'Hide Packed' }))

        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) other list/i })).toBeTruthy())
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

describe('ViewPackingList trip countdown', () => {
    /**
     * A YYYY-MM-DD date the given number of days either side of today. Hard-coded
     * dates would drift into the past and change which state the countdown is in.
     */
    const daysFromToday = (days: number) => {
        const date = new Date()
        date.setDate(date.getDate() + days)
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

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

    function renderTrip(overrides: Record<string, unknown>) {
        mockUseDatabase.mockReturnValue({ db: makeTripDb(overrides) as unknown as PackingAppDatabase })
        renderComponent()
    }

    it('counts the sleeps until a trip still to come', async () => {
        renderTrip({ destination: 'Cornwall', startDate: daysFromToday(12), endDate: daysFromToday(19) })
        expect((await screen.findByTestId('trip-countdown')).textContent).toContain('12 sleeps until Cornwall')
    })

    it('celebrates the day of the trip rather than showing zero sleeps', async () => {
        renderTrip({ destination: 'Cornwall', startDate: daysFromToday(0), endDate: daysFromToday(7) })
        const countdown = await screen.findByTestId('trip-countdown')
        expect(countdown.textContent).toContain('Off to Cornwall today!')
        expect(countdown.textContent).not.toContain('0 sleeps')
    })

    it('says the trip is under way once it has started', async () => {
        renderTrip({ destination: 'Cornwall', startDate: daysFromToday(-3), endDate: daysFromToday(4) })
        const countdown = await screen.findByTestId('trip-countdown')
        expect(countdown.textContent).toContain('In Cornwall now')
        expect(countdown.textContent).not.toContain('-')
    })

    it('never counts backwards for a trip that is over', async () => {
        renderTrip({ destination: 'Cornwall', startDate: daysFromToday(-10), endDate: daysFromToday(-3) })
        const countdown = await screen.findByTestId('trip-countdown')
        expect(countdown.textContent).toContain('Back from Cornwall')
        expect(countdown.textContent).not.toContain('-')
    })

    it('shows no countdown at all for a list with no dates', async () => {
        renderTrip({ destination: 'Cornwall' })
        await screen.findByTestId('trip-details')
        expect(screen.queryByTestId('trip-countdown')).toBeNull()
    })

    it('still shows the trip dates alongside the countdown', async () => {
        const start = daysFromToday(12)
        renderTrip({ destination: 'Cornwall', startDate: start, endDate: daysFromToday(19) })

        const details = await screen.findByTestId('trip-details')
        const [year, month, day] = start.split('-').map(Number)
        expect(details.textContent).toContain(new Date(year, month - 1, day).toLocaleDateString())
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

    /**
     * The grid's checkbox is the person's chip, labelled with both the item and
     * whose it is — the same name can be on the row twice.
     */
    function checkboxFor(itemText: string, person = 'Alice') {
        return screen.getByRole('checkbox', { name: `${itemText} for ${person}` }) as HTMLInputElement
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
        fireEvent.click(checkboxFor('Wellies', 'Bob'))

        expect(mockTapFeedback).not.toHaveBeenCalled()
    })

    it('plays a flourish on the row that was just checked', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(checkboxFor('Passport'))

        expect(screen.getByTestId('item-tick-a1')).toBeTruthy()
        expect(screen.getByTestId('grid-cell-a1').className).toContain('grid-cell-packed')
    })

    it('flourishes only the row that was checked', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        fireEvent.click(checkboxFor('Passport'))

        expect(screen.queryByTestId('item-tick-a2')).toBeNull()
        expect(screen.getByTestId('grid-cell-a2').className).not.toContain('grid-cell-packed')
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
        fireEvent.click(checkboxFor('Wellies', 'Bob'))

        expect(screen.queryByTestId('item-tick-b1')).toBeNull()
        expect(screen.getByTestId('grid-cell-b1').className).not.toContain('grid-cell-packed')
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

    it('files a new item into the card it was typed into', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy())

        const { input, fields } = composerFor('Hiking')
        fireEvent.change(input, { target: { value: 'Trail map' } })
        fireEvent.change(fields.getByLabelText('Who for'), { target: { value: 'Alice' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        const added = await savedItem('Trail map')
        expect(added.category).toBe('Hiking')
        expect(added.personName).toBe('Alice')
    })

    it('files into the catch-all section from the catch-all card', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy())

        const { input, fields } = composerFor('Other')
        fireEvent.change(input, { target: { value: 'Odds and ends' } })
        fireEvent.change(fields.getByLabelText('Who for'), { target: { value: 'Alice' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        expect((await savedItem('Odds and ends')).category).toBeUndefined()
    })

    it('saves a quantity typed alongside the item', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy())

        const { input, fields } = composerFor('Hiking')
        fireEvent.change(input, { target: { value: 'Socks' } })
        fireEvent.change(fields.getByLabelText('Who for'), { target: { value: 'Alice' } })
        fireEvent.change(fields.getByLabelText('Quantity'), { target: { value: '5' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        expect((await savedItem('Socks')).quantity).toBe(5)
    })

    it('files an item for whoever the list is filtered to, without being asked again', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /^Bob/ }))
        typeAndAdd(composerFor('Essentials').input, 'Compass')

        const added = await savedItem('Compass')
        expect(added.category).toBe('Essentials')
        expect(added.personName).toBe('Bob')
    })

    it('adds for someone with nothing in a section yet, from category view', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByText('Tent')).toBeTruthy())

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
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Tent' })).toBeTruthy())

        const { input, fields } = composerFor('Hiking')
        // The who-for picker only appears once there is something typed
        fireEvent.change(input, { target: { value: 'ten' } })
        fireEvent.change(fields.getByLabelText('Who for'), { target: { value: 'Bob' } })
        fireEvent.click(screen.getByRole('option', { name: /Tent/ }))
        fireEvent.keyDown(input, { key: 'Enter' })

        const added = await savedItem('Tent')
        expect(added.category).toBe('Hiking')
        expect(added.personName).toBe('Bob')
    })

    it('does not suggest what this person already has', async () => {
        renderComponentMultiCategory()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Tent' })).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /^Alice/ }))
        fireEvent.change(composerFor('Hiking').input, { target: { value: 'ten' } })

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

    const checkboxFor = chipFor

    beforeEach(() => {
        mockList(familyList)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('when everything in a section is packed', () => {
        // Sections are categories. Documents holds one item and it is packed,
        // so it is the section that arrives finished.
        it('folds a section that was already finished when the list opened', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

            expect(screen.getByRole('button', { name: /expand documents list/i })).toBeTruthy()
        })

        it('leaves a section with items still to pack open', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

            expect(row('Toothbrush')).toBeTruthy()
            expect(row('Armbands')).toBeTruthy()
        })

        it('keeps the folded section on the page with its count and its celebration', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

            const header = screen.getByRole('button', { name: /expand documents list/i })
            expect(header.textContent).toContain('Documents')
            expect(header.textContent).toContain('1 / 1')
            expect(screen.getByLabelText(/all packed for documents/i)).toBeTruthy()
        })

        it('folds a section that is finished in front of the user', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

            fireEvent.click(checkboxFor('Toothbrush', 'Bob'))

            await waitFor(
                () => expect(screen.getByRole('button', { name: /expand toiletries list/i })).toBeTruthy(),
                { timeout: 3000 },
            )
        })

        it('leaves a section the user reopened open when something else is packed', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /expand documents list/i }))

            fireEvent.click(checkboxFor('Toothbrush', 'Bob'))
            await waitFor(
                () => expect(screen.getByRole('button', { name: /expand toiletries list/i })).toBeTruthy(),
                { timeout: 3000 },
            )

            expect(screen.getByRole('button', { name: /collapse documents list/i })).toBeTruthy()
        })

        it('folds a section again once it is packed back up', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))

            // Unpacking reopens Documents; packing it back folds it away again
            fireEvent.click(checkboxFor('Passport', 'Alice'))
            fireEvent.click(screen.getByRole('button', { name: 'Hide Packed' }))
            expect(screen.getByRole('button', { name: /collapse documents list/i })).toBeTruthy()

            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
            fireEvent.click(checkboxFor('Passport', 'Alice'))
            fireEvent.click(screen.getByRole('button', { name: 'Hide Packed' }))

            await waitFor(
                () => expect(screen.getByRole('button', { name: /expand documents list/i })).toBeTruthy(),
                { timeout: 3000 },
            )
        })
    })

    describe('showing packed items', () => {
        it('hands back the sections the page folded', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            expect(screen.getByRole('button', { name: /expand documents list/i })).toBeTruthy()

            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))

            expect(row('Passport')).toBeTruthy()
            expect(screen.getByRole('button', { name: /collapse documents list/i })).toBeTruthy()
        })

        it('leaves a section the user folded by hand alone', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse toiletries list/i }))

            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))

            expect(screen.getByRole('button', { name: /expand toiletries list/i })).toBeTruthy()
        })
    })

    describe('collapse all / expand all', () => {
        it('folds every section', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

            fireEvent.click(screen.getByRole('button', { name: /collapse all/i }))

            expect(screen.queryByRole('button', { name: 'Edit Toothbrush' })).toBeNull()
            expect(screen.queryByRole('button', { name: 'Edit Armbands' })).toBeNull()
        })

        it('opens every section, including the ones folded automatically', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse all/i }))

            fireEvent.click(screen.getByRole('button', { name: /expand all/i }))

            expect(row('Toothbrush')).toBeTruthy()
            expect(screen.getByRole('button', { name: /collapse documents list/i })).toBeTruthy()
        })

        it('does not re-fold a finished section after the user opens everything', async () => {
            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse all/i }))
            fireEvent.click(screen.getByRole('button', { name: /expand all/i }))

            fireEvent.click(checkboxFor('Armbands', 'Cara'))
            await new Promise(resolve => setTimeout(resolve, 1200))

            expect(screen.getByRole('button', { name: /collapse documents list/i })).toBeTruthy()
        })

        it('is not offered when the list has only one section', async () => {
            mockList({
                ...familyList,
                id: 'test-list-solo',
                items: [familyList.items[4]],
            })
            renderList('test-list-solo')
            await waitFor(() => expect(row('Armbands')).toBeTruthy())

            expect(screen.queryByRole('button', { name: /collapse all/i })).toBeNull()
        })
    })

    describe('remembering how the list was left', () => {
        it('reopens with the sections the user folded still folded', async () => {
            const { unmount } = renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse toiletries list/i }))
            unmount()

            renderList()
            await waitFor(() => expect(row('Armbands')).toBeTruthy())

            expect(screen.getByRole('button', { name: /expand toiletries list/i })).toBeTruthy()
        })

        it('opens showing everyone, whoever the user was last packing for', async () => {
            // Fold state is how this list is kept; a filter is something the
            // user was doing. Restoring one a week later shows them a third of
            // their list and no reason why.
            const { unmount } = renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /^Cara/ }))
            expect(screen.queryByRole('button', { name: 'Edit Toothbrush' })).toBeNull()
            unmount()

            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

            expect(screen.getByRole('button', { name: /^Cara/ }).getAttribute('aria-pressed')).toBe('false')
        })

        it('reopens still showing packed items', async () => {
            const { unmount } = renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: 'Show Packed' }))
            unmount()

            renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

            expect(screen.getByText('Passport')).toBeTruthy()
        })

        it('reopens a folded group inside a section still folded', async () => {
            const { unmount } = renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse toiletries/i }))
            expect(screen.queryByText('Toothbrush')).toBeNull()
            unmount()

            renderList()
            await waitFor(() => expect(row('Armbands')).toBeTruthy())

            expect(screen.queryByText('Toothbrush')).toBeNull()
        })

        it('does not carry one list\'s folded sections onto another', async () => {
            const { unmount } = renderList()
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
            fireEvent.click(screen.getByRole('button', { name: /collapse toiletries list/i }))
            unmount()

            mockList({ ...familyList, id: 'test-list-other' })
            renderList('test-list-other')
            await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

            expect(screen.getByRole('button', { name: /collapse toiletries list/i })).toBeTruthy()
        })
    })
})

describe('ViewPackingList opening a long list for the first time', () => {
    // Six categories so the list has plenty to fold, and 36 items so it clears
    // the "long enough to arrive as a wall" threshold. Sections are categories,
    // so it is the spread of categories that decides how much there is to fold.
    const categories = ['Clothes', 'Toiletries', 'Documents', 'Electronics', 'Camping', 'Food']
    function bigList(id: string, itemsPerCategory: number) {
        return {
            id,
            name: 'Big Trip',
            createdAt: '2026-01-01T00:00:00Z',
            items: categories.flatMap((category) =>
                Array.from({ length: itemsPerCategory }, (_, i) => ({
                    id: `${category}-${i}`,
                    itemText: `${category} item ${i}`,
                    personName: 'Alice',
                    personId: 'p0',
                    questionId: 'q1',
                    optionId: 'o1',
                    category,
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
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())

        expect(screen.queryByRole('button', { name: 'Edit Clothes item 0' })).toBeNull()
        expect(screen.getByRole('button', { name: /expand clothes list/i })).toBeTruthy()
    })

    it('keeps every section and its count on the page', async () => {
        mockList(bigList('big-2', 6))
        renderList('big-2')
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())

        for (const category of categories) {
            expect(screen.getByRole('button', { name: new RegExp(`expand ${category} list`, 'i') }).textContent)
                .toContain('0 / 6')
        }
    })

    it('says why the list arrived folded, and offers the way out', async () => {
        mockList(bigList('big-3', 6))
        renderList('big-3')
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())

        const note = screen.getByTestId('folded-on-open-note')
        expect(note.textContent).toContain('all 6 sections start folded')

        fireEvent.click(within(note).getByRole('button', { name: /expand all/i }))

        expect(screen.getByRole('button', { name: 'Edit Clothes item 0' })).toBeTruthy()
        expect(screen.queryByTestId('folded-on-open-note')).toBeNull()
    })

    it('drops the note as soon as the user opens a section themselves', async () => {
        mockList(bigList('big-4', 6))
        renderList('big-4')
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /expand clothes list/i }))

        expect(screen.queryByTestId('folded-on-open-note')).toBeNull()
    })

    it('leaves a short list open', async () => {
        // Six categories, one item each — plenty of sections, but no wall
        mockList(bigList('small-1', 1))
        renderList('small-1')
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())

        expect(screen.getByRole('button', { name: 'Edit Clothes item 0' })).toBeTruthy()
        expect(screen.queryByTestId('folded-on-open-note')).toBeNull()
    })

    it('leaves a long list with a single section open, having nothing to fold into', async () => {
        const list = bigList('solo-1', 6)
        mockList({ ...list, items: list.items.map(item => ({ ...item, category: 'Clothes' })) })
        renderList('solo-1')
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())

        expect(screen.getByRole('button', { name: 'Edit Clothes item 0' })).toBeTruthy()
    })

    it('does not fold a list the user has opened before', async () => {
        mockList(bigList('big-5', 6))
        const { unmount } = renderList('big-5')
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())
        fireEvent.click(within(screen.getByTestId('folded-on-open-note')).getByRole('button', { name: /expand all/i }))
        unmount()

        renderList('big-5')
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())

        // Their arrangement wins, even though it matches the plain defaults
        expect(screen.getByRole('button', { name: 'Edit Clothes item 0' })).toBeTruthy()
        expect(screen.queryByTestId('folded-on-open-note')).toBeNull()
    })

    it('reopens folded if that is how the user left it', async () => {
        mockList(bigList('big-6', 6))
        const { unmount } = renderList('big-6')
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())
        unmount()

        renderList('big-6')
        await waitFor(() => expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy())

        expect(screen.queryByRole('button', { name: 'Edit Clothes item 0' })).toBeNull()
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

// ── Last minute items ─────────────────────────────────────────────────────────

// Some things can't go in the bag until you're walking out of the door — the
// phone charger, the toothbrush, the passport in a pocket. Marking an item
// "last minute" lifts it out of whoever's (or whatever section's) card it was
// in and collects it in one card at the end of the list.

const lastMinuteBaseItems: PackingListItem[] = [
    { id: 'lm-1', itemText: 'Passport', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false, category: 'Documents' },
    { id: 'lm-2', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1', questionId: 'q2', optionId: 'o2', packed: false, category: 'Toiletries' },
    { id: 'lm-3', itemText: 'Phone charger', personName: '', personId: '', questionId: 'q3', optionId: 'o3', packed: false, communal: true, category: 'Tech' },
]

function makeLastMinuteList(items: PackingListItem[]) {
    return {
        id: 'test-list-lm',
        name: 'Last Minute Trip',
        createdAt: '2026-01-01T00:00:00Z',
        items,
    }
}

function renderLastMinuteList(items: PackingListItem[] = lastMinuteBaseItems) {
    const db = {
        getPackingList: vi.fn().mockResolvedValue(makeLastMinuteList(items)),
        savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
    }
    mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
    render(
        <MemoryRouter initialEntries={['/view-list/test-list-lm']}>
            <Routes>
                <Route path="/view-list/:id" element={<ViewPackingList />} />
            </Routes>
        </MemoryRouter>
    )
    return db
}

/** The section card whose heading is `title`. */
function sectionCard(title: string): HTMLElement {
    const card = screen.getAllByTestId('list-section').find(section => {
        const heading = within(section).queryByText(title)
        return heading !== null && heading.tagName !== 'INPUT'
    })
    if (!card) throw new Error(`No section card headed "${title}"`)
    return card
}

/** The most recent list handed to the local database. */
function savedItems(db: { savePackingList: ReturnType<typeof vi.fn> }): PackingListItem[] {
    const calls = db.savePackingList.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    return calls[calls.length - 1][0].items
}

describe('ViewPackingList last minute items', () => {
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
            saveWithSyncPrevention: vi.fn().mockImplementation(async (data) => data),
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('has no last minute section until something is marked', async () => {
        renderLastMinuteList()

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())
        expect(screen.queryByText('Last Minute')).toBeNull()
    })

    it('collects a marked item in a last minute section instead of its own', async () => {
        renderLastMinuteList([
            { ...lastMinuteBaseItems[0], lastMinute: true },
            lastMinuteBaseItems[1],
        ])

        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())
        expect(within(sectionCard('Last Minute')).getByRole('button', { name: 'Edit Passport' })).toBeTruthy()
        // Its own category card has gone with it — the card was only holding it
        expect(screen.queryByRole('button', { name: /(expand|collapse) documents list/i })).toBeNull()
    })

    it('says what the section is for', async () => {
        renderLastMinuteList([{ ...lastMinuteBaseItems[0], lastMinute: true }])

        await waitFor(() => expect(screen.getByText('Last Minute')).toBeTruthy())
        expect(within(sectionCard('Last Minute')).getByText(/just before you (go|leave)/i)).toBeTruthy()
    })

    it('moves an item into the last minute section when it is marked', async () => {
        const db = renderLastMinuteList()

        await waitFor(() => expect(row('Passport')).toBeTruthy())
        // Marking lives in the row's panel, reached through its name
        fireEvent.click(row('Passport'))
        fireEvent.click(screen.getByRole('button', { name: /mark alice's passport as a last minute item/i }))

        await waitFor(() => expect(within(sectionCard('Last Minute')).getByRole('button', { name: 'Edit Passport' })).toBeTruthy())
        expect(screen.queryByRole('button', { name: /(expand|collapse) documents list/i })).toBeNull()
        expect(savedItems(db).find(item => item.id === 'lm-1')?.lastMinute).toBe(true)
    })

    it('sends an item back to its own section when it is unmarked', async () => {
        const db = renderLastMinuteList([
            { ...lastMinuteBaseItems[0], lastMinute: true },
            lastMinuteBaseItems[1],
        ])

        await waitFor(() => expect(row('Passport')).toBeTruthy())
        fireEvent.click(row('Passport'))
        fireEvent.click(screen.getByRole('button', { name: /pack alice's passport with everything else/i }))

        await waitFor(() => expect(within(sectionCard('Documents')).getByRole('button', { name: 'Edit Passport' })).toBeTruthy())
        expect(screen.queryByText('Last Minute')).toBeNull()
        expect(savedItems(db).find(item => item.id === 'lm-1')?.lastMinute).toBeUndefined()
    })

    it('keeps a marked communal item out of the shared card', async () => {
        renderLastMinuteList([
            lastMinuteBaseItems[0],
            { ...lastMinuteBaseItems[2], lastMinute: true },
        ])

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())
        expect(within(sectionCard('Last Minute')).getByRole('button', { name: 'Edit Phone charger' })).toBeTruthy()
        expect(screen.queryByText('Shared Items')).toBeNull()
    })

    it('keeps a marked item out of its category card in category view', async () => {
        renderLastMinuteList([
            { ...lastMinuteBaseItems[0], lastMinute: true },
            lastMinuteBaseItems[1],
        ])

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())

        expect(within(sectionCard('Last Minute')).getByRole('button', { name: 'Edit Passport' })).toBeTruthy()
        expect(screen.queryByText('Documents')).toBeNull()
        expect(within(sectionCard('Toiletries')).getByRole('button', { name: 'Edit Toothbrush' })).toBeTruthy()
    })

    it('reads the last minute card the way every other card reads', async () => {
        // It holds everybody's, so it is a grid like the rest: the item down
        // the side, whose it is across it, and shared items on their own row.
        renderLastMinuteList([
            { ...lastMinuteBaseItems[0], lastMinute: true },
            { ...lastMinuteBaseItems[2], lastMinute: true },
        ])

        await waitFor(() => expect(row('Passport')).toBeTruthy())

        const card = within(sectionCard('Last Minute'))
        expect(card.getByRole('checkbox', { name: 'Passport for Alice' })).toBeTruthy()
        expect(card.getByRole('checkbox', { name: 'Phone charger for the whole group' })).toBeTruthy()
    })

    it('stays where the user is reading when an item is marked', async () => {
        const scrollIntoView = vi.fn()
        Element.prototype.scrollIntoView = scrollIntoView
        renderLastMinuteList()

        await waitFor(() => expect(row('Passport')).toBeTruthy())
        fireEvent.click(row('Passport'))
        fireEvent.click(screen.getByRole('button', { name: /mark alice's passport as a last minute item/i }))

        // The card is at the far end of a list being read down; the highlight
        // says where the item went without taking the page with it.
        await waitFor(() => expect(within(sectionCard('Last Minute')).getByRole('button', { name: 'Edit Passport' })).toBeTruthy())
        expect(scrollIntoView).not.toHaveBeenCalled()
        expect(screen.getByTestId('grid-cell-lm-1').className).toContain('ring-green-400')
    })

    it('marks items added inside the last minute section as last minute', async () => {
        const db = renderLastMinuteList([{ ...lastMinuteBaseItems[0], lastMinute: true }])

        await waitFor(() => expect(screen.getByText('Passport')).toBeTruthy())
        const card = sectionCard('Last Minute')
        fireEvent.change(within(card).getAllByPlaceholderText(/add/i)[0], { target: { value: 'Contact lenses' } })
        fireEvent.click(within(card).getAllByRole('button', { name: /^add$/i })[0])

        await waitFor(() => expect(within(sectionCard('Last Minute')).getByRole('button', { name: 'Edit Contact lenses' })).toBeTruthy())
        expect(savedItems(db).find(item => item.itemText === 'Contact lenses')?.lastMinute).toBe(true)
    })
})

// ─── Packing for one person ─────────────────────────────────────────────────

describe('ViewPackingList people filter', () => {
    // Alice is in all three sections; Bob only in Clothes; the tent is nobody's.
    const familyList = {
        id: 'test-list-filter',
        name: 'Filter Trip',
        createdAt: '2026-01-01T00:00:00Z',
        guests: [{ id: 'g1', name: 'Zoe' }, { id: 'g2', name: 'Dan' }],
        items: [
            { id: 'f6', itemText: 'Armbands', personName: 'Zoe', personId: 'g1', questionId: 'q1', optionId: 'o1', category: 'Clothes', packed: false },
            { id: 'f1', itemText: 'Sunhat', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', category: 'Clothes', packed: false },
            { id: 'f2', itemText: 'Wellies', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', category: 'Clothes', packed: false },
            { id: 'f3', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', category: 'Toiletries', packed: false },
            { id: 'f4', itemText: 'Passport', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', category: 'Documents', packed: true },
            { id: 'f5', itemText: 'Tent', personName: '', personId: '', questionId: 'q1', optionId: 'o1', category: 'Clothes', packed: false, communal: true },
        ],
    }

    let db: ReturnType<typeof makeDb>

    beforeEach(() => {
        db = makeDb()
        db.getPackingList.mockResolvedValue(familyList)
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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...familyList, _rev: '2' }),
        })
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function renderList() {
        render(
            <MemoryRouter initialEntries={['/view-list/test-list-filter']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
        await waitFor(() => expect(row('Sunhat')).toBeTruthy())
    }

    const chip = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })

    describe('choosing who', () => {
        it('starts on everybody, with nothing pressed', async () => {
            await renderList()

            expect(chip('Alice').getAttribute('aria-pressed')).toBe('false')
            expect(chip('Bob').getAttribute('aria-pressed')).toBe('false')
            expect(row('Wellies')).toBeTruthy()
        })

        it('narrows to one person on the first tap', async () => {
            await renderList()

            fireEvent.click(chip('Alice'))

            expect(row('Sunhat')).toBeTruthy()
            expect(screen.queryByRole('button', { name: 'Edit Wellies' })).toBeNull()
        })

        it('adds a second person rather than replacing the first', async () => {
            await renderList()

            fireEvent.click(chip('Alice'))
            fireEvent.click(chip('Bob'))

            expect(row('Sunhat')).toBeTruthy()
            expect(row('Wellies')).toBeTruthy()
        })

        it('takes a person back out of the selection', async () => {
            await renderList()

            fireEvent.click(chip('Alice'))
            fireEvent.click(chip('Bob'))
            fireEvent.click(chip('Alice'))

            expect(screen.queryByRole('button', { name: 'Edit Sunhat' })).toBeNull()
            expect(row('Wellies')).toBeTruthy()
        })

        it('goes back to everybody when the last person is tapped off', async () => {
            await renderList()

            fireEvent.click(chip('Bob'))
            fireEvent.click(chip('Bob'))

            expect(row('Sunhat')).toBeTruthy()
            expect(row('Wellies')).toBeTruthy()
        })

        it('offers Clear only while a filter is on', async () => {
            await renderList()
            expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()

            fireEvent.click(chip('Alice'))
            fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

            expect(row('Wellies')).toBeTruthy()
            expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
        })
    })

    describe('what the cards show', () => {
        it('drops a section with nothing for the selection, and says how many went', async () => {
            await renderList()

            fireEvent.click(chip('Bob'))

            expect(screen.queryByRole('button', { name: /(expand|collapse) toiletries list/i })).toBeNull()
            expect(screen.getByRole('button', { name: /(expand|collapse) clothes list/i })).toBeTruthy()
        })

        it('brings them back when the filter is cleared', async () => {
            await renderList()
            fireEvent.click(chip('Bob'))

            fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

            expect(screen.getByRole('button', { name: /(expand|collapse) toiletries list/i })).toBeTruthy()
        })

        it('keeps a shared item, folded away rather than answering a question nobody asked', async () => {
            await renderList()

            fireEvent.click(chip('Bob'))

            const shared = screen.getByRole('button', { name: /Shared \(1\)/ })
            expect(shared.getAttribute('aria-expanded')).toBe('false')

            fireEvent.click(shared)
            expect(row('Tent')).toBeTruthy()
        })

        it('leaves shared items among the rest when nobody is filtered to', async () => {
            await renderList()

            expect(screen.queryByRole('button', { name: /Shared \(1\)/ })).toBeNull()
            expect(row('Tent')).toBeTruthy()
        })

        it('never lets a shared item into one person’s count', async () => {
            await renderList()

            fireEvent.click(chip('Alice'))

            // Clothes holds Alice's Sunhat, Bob's Wellies and the group's Tent.
            // Only the Sunhat is hers.
            expect(screen.getByRole('button', { name: /collapse clothes list/i }).textContent)
                .toContain('0 / 1 for Alice')
        })
    })

    describe('the group\'s own chip', () => {
        // Scoped to the strip: the card's own "Shared (n)" disclosure shares
        // the word, and the chip's emoji is decorative so it carries no name.
        const shared = () => within(screen.getByTestId('people-key')).getByRole('button', { name: /^Shared/ })

        it('keeps a filled chip meaning pressed, and nothing else', async () => {
            // A chip filled green for "finished" read as selected beside the
            // white ones that read as not — two states after one signal.
            await renderList()

            fireEvent.click(chip('Zoe'))
            fireEvent.click(screen.getByRole('button', { name: "Pack all 1 of Zoe's" }))
            await waitFor(() => expect(screen.getByText(/Zoe's bag is packed/)).toBeTruthy())

            // Pressed: filled
            expect(chip('Zoe').className).toContain('bg-blue-600')

            // Finished but not pressed: the same white as everyone else, with
            // the news carried on her face instead
            fireEvent.click(chip('Zoe'))
            expect(chip('Zoe').className).not.toContain('bg-emerald')
            expect(chip('Zoe').className).toContain('bg-white')
            expect(chip('Zoe').className).toBe(chip('Bob').className)
        })

        it('offers the group alongside the people', async () => {
            await renderList()

            expect(shared().getAttribute('aria-pressed')).toBe('false')
        })

        it('shows the group\'s items and nobody else\'s', async () => {
            await renderList()

            fireEvent.click(shared())

            expect(row('Tent')).toBeTruthy()
            expect(screen.queryByRole('button', { name: 'Edit Sunhat' })).toBeNull()
            expect(screen.queryByRole('button', { name: 'Edit Wellies' })).toBeNull()
        })

        it('brings the shared items back among the rest when asked for by name', async () => {
            await renderList()

            fireEvent.click(chip('Alice'))
            // Filtered to a person they fold away; asked for, they come out
            expect(screen.getByRole('button', { name: /Shared \(1\)/ })).toBeTruthy()

            fireEvent.click(shared())

            expect(screen.queryByRole('button', { name: /Shared \(1\)/ })).toBeNull()
            expect(row('Tent')).toBeTruthy()
            expect(row('Sunhat')).toBeTruthy()
        })

        it('counts the group\'s items against the group, and nobody else', async () => {
            await renderList()

            fireEvent.click(shared())

            expect(shared().textContent).toContain('0/1')
            // Clothes holds Alice's Sunhat, Bob's Wellies, Zoe's Armbands and
            // the group's Tent — only the Tent is the group's.
            expect(screen.getByRole('button', { name: /collapse clothes list/i }).textContent)
                .toContain('0 / 1 for shared items')
        })

        it('is not somebody, so it is offered no bag to pack and no name to change', async () => {
            await renderList()

            fireEvent.click(shared())

            expect(screen.queryByRole('button', { name: /^Pack all/ })).toBeNull()
            expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull()
        })
    })

    describe('one person at a time', () => {
        it('packs everything of one person’s, and offers it back', async () => {
            await renderList()
            fireEvent.click(chip('Alice'))

            // Passport is already packed, so it is two items, not three
            fireEvent.click(screen.getByRole('button', { name: "Pack all 2 of Alice's" }))

            expect(mockShowToast).toHaveBeenCalledWith(
                "Packed 2 of Alice's items",
                'success',
                undefined,
                expect.objectContaining({ label: 'Undo' }),
            )
        })

        it('keeps the filter on a guest who has just been renamed', async () => {
            // The filter holds names. Leave the old one in it and the page is
            // filtered to somebody no chip names — every card empty, no chip
            // pressed, and nothing on screen to undo it.
            await renderList()
            fireEvent.click(chip('Zoe'))

            fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
            const field = screen.getByRole('textbox', { name: 'Rename Zoe' })
            fireEvent.change(field, { target: { value: 'Zoey' } })
            fireEvent.blur(field)

            await waitFor(() => expect(chip('Zoey').getAttribute('aria-pressed')).toBe('true'))
            expect(row('Armbands')).toBeTruthy()
        })

        it('goes back to everybody when the filtered guest is removed', async () => {
            await renderList()
            fireEvent.click(chip('Zoe'))

            fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
            // The bar's button opens the confirmation; the dialog's does it
            const dialog = within(await screen.findByRole('dialog'))
            fireEvent.click(dialog.getByRole('button', { name: 'Remove' }))

            // Not left filtered to a person who no longer exists
            await waitFor(() => expect(row('Wellies')).toBeTruthy())
        })

        it('marks a bag that is finished rather than leaving a name on its own', async () => {
            await renderList()
            fireEvent.click(chip('Zoe'))

            fireEvent.click(screen.getByRole('button', { name: "Pack all 1 of Zoe's" }))

            await waitFor(() => expect(screen.getByText(/Zoe's bag is packed/)).toBeTruthy())
            // The trip's own celebration is still the trip's
            expect(screen.queryByTestId('completion-banner')).toBeNull()
        })

        it('says nothing about packing for two people at once', async () => {
            await renderList()

            fireEvent.click(chip('Alice'))
            fireEvent.click(chip('Bob'))

            expect(screen.queryByRole('button', { name: /^Pack all/ })).toBeNull()
        })

        it('counts by headcount past one person, rather than listing names', async () => {
            // A comma-joined list beside a fraction reads as a truncated list,
            // and on a phone it runs straight under the button beside it. The
            // strip above is what says which people.
            await renderList()

            fireEvent.click(chip('Alice'))
            fireEvent.click(chip('Bob'))

            expect(screen.getByRole('button', { name: /collapse clothes list/i }).textContent)
                .toContain('for 2 people')
        })

        it('keeps Clear reachable, out of the strip that scrolls', async () => {
            // Inside the strip it was pushed off the end of a phone by the
            // fifth person, so the one control that undoes the filter never
            // reached the screen.
            await renderList()
            fireEvent.click(chip('Alice'))

            const clear = screen.getByRole('button', { name: 'Clear' })
            expect(clear.closest('[aria-label="Filter by person"]')).toBeNull()
        })

        it('offers a way in when the filter leaves nothing on the page', async () => {
            // Every composer lives inside a card, and a fresh guest's cards
            // have all been dropped — so without this there is no way to give
            // them their first item, and the page just looks broken.
            await renderList()

            fireEvent.click(chip('Dan'))

            expect(screen.getByText(/Nothing on this list is for Dan yet/)).toBeTruthy()
        })
    })
})

describe('a section named after a question', () => {
    // The section a question's items fall into is named with the question's own
    // text (see `defaultCategoryFor`), so a heading arrives as "Will you be
    // staying overnight?" — a question where the card wants a noun phrase.
    const QUESTION_CATEGORY = 'Will you be staying overnight?'
    const questionCategoryList = {
        id: 'test-list-question-heading',
        name: 'Question Heading Trip',
        createdAt: '2026-01-01T00:00:00Z',
        items: [
            { id: 'qh-1', itemText: 'Pyjamas', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false, category: QUESTION_CATEGORY, order: 0 },
        ],
    }

    let savePackingList: ReturnType<typeof vi.fn>

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
            saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...questionCategoryList, _rev: '2' }),
        })
        savePackingList = vi.fn().mockResolvedValue({ rev: '2' })
        mockUseDatabase.mockReturnValue({
            db: {
                getPackingList: vi.fn().mockResolvedValue(questionCategoryList),
                savePackingList,
                getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }),
            } as unknown as PackingAppDatabase,
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function renderList() {
        render(
            <MemoryRouter initialEntries={['/view-list/test-list-question-heading']}>
                <Routes>
                    <Route path="/view-list/:id" element={<ViewPackingList />} />
                </Routes>
            </MemoryRouter>
        )
        await waitFor(() => expect(row('Pyjamas')).toBeTruthy())
    }

    it('drops the question mark from the heading', async () => {
        await renderList()

        expect(screen.getByText('Will you be staying overnight')).toBeTruthy()
        expect(screen.queryByText(QUESTION_CATEGORY)).toBeNull()
    })

    it('drops it from the controls that name the section too', async () => {
        await renderList()

        expect(screen.getByRole('button', { name: 'Collapse Will you be staying overnight list' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Check all in Will you be staying overnight' })).toBeTruthy()
    })

    it('files an item typed into the card under the section it was typed into', async () => {
        // The heading is display only: strip the question mark from the stored
        // category and a typed item starts a second card beside the first.
        await renderList()

        const card = screen.getByTestId('list-section')
        fireEvent.change(within(card).getByPlaceholderText('Add new item...'), { target: { value: 'Eye mask' } })
        fireEvent.click(within(card).getByRole('button', { name: 'Add' }))

        await waitFor(() => expect(savePackingList).toHaveBeenCalled())
        const saved = savePackingList.mock.calls[0][0] as { items: PackingListItem[] }
        expect(saved.items.find(item => item.itemText === 'Eye mask')?.category).toBe(QUESTION_CATEGORY)

        await waitFor(() => expect(screen.getAllByTestId('list-section').length).toBe(1))
    })
})


// ─── Reporting a save that never reached the Pod ─────────────────────────────

describe('ViewPackingList save-to-Pod failures', () => {
    class PodUrlUnavailableError extends Error {
        constructor(public readonly reason: string) {
            super(reason === 'no-storage-declared' ? 'No pod found for your account' : "Couldn't reach your Pod. This change is saved on this device only.")
            this.name = 'PodUrlUnavailableError'
        }
    }

    beforeEach(() => {
        mockShowToast.mockClear()
        mockCaptureException.mockClear()
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
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
        mockUseDatabase.mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    /** The onSaveError the page handed to usePodSync. */
    async function saveErrorHandler() {
        renderComponent()
        await waitFor(() => expect(mockUsePodSync).toHaveBeenCalled())
        const options = mockUsePodSync.mock.calls.at(-1)![0] as { onSaveError: (message: string, cause?: unknown) => void }
        return options.onSaveError
    }

    it('keeps a Pod we could not reach out of Sentry, and says what happened', async () => {
        // This is the "No pod URL found" issue: a few seconds of bad network
        // reported as an exception, and shown to the user as an internal string.
        const onSaveError = await saveErrorHandler()
        const cause = new PodUrlUnavailableError('profile-unreachable')

        act(() => onSaveError(cause.message, cause))

        expect(mockCaptureException).not.toHaveBeenCalled()
        expect(mockShowToast).toHaveBeenCalledWith(cause.message, 'error')
    })

    it('still reports a save that failed for any other reason', async () => {
        const onSaveError = await saveErrorHandler()
        const cause = new Error('500 Internal Server Error')

        act(() => onSaveError(cause.message, cause))

        // The error itself, not its message: a string reaches Sentry with only
        // errorReporting's own frames for a stack.
        expect(mockCaptureException).toHaveBeenCalledWith(cause)
        expect(mockShowToast).toHaveBeenCalledWith(
            'Failed to save to Pod: 500 Internal Server Error',
            'error',
            expect.stringContaining('500 Internal Server Error')
        )
    })

    it('reports an account with no Pod, which no later save will fix', async () => {
        const onSaveError = await saveErrorHandler()
        const cause = new PodUrlUnavailableError('no-storage-declared')

        act(() => onSaveError(cause.message, cause))

        expect(mockCaptureException).toHaveBeenCalledWith(cause)
    })
})
