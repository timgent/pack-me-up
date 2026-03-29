import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { deduplicateItems, getUnreviewedCustomItems } from './create-packing-list'
import { PackingListItem, PackingList } from '../create-packing-list/types'
import { PackingListQuestionSet } from '../edit-questions/types'

// ─── shared test factories ────────────────────────────────────────────────────

const makeItem = (overrides: Partial<PackingListItem> & { itemText: string; personId: string }): PackingListItem => ({
    id: 'test-id',
    personName: 'Alice',
    questionId: 'q1',
    optionId: 'o1',
    packed: false,
    ...overrides,
})

const makeCustomItem = (overrides: Partial<PackingListItem> & { itemText: string }): PackingListItem => ({
    id: 'custom-id',
    itemText: 'Sunscreen SPF50',
    personName: 'Alice',
    personId: '',
    questionId: '',
    optionId: '',
    packed: false,
    ...overrides,
})

const makePackingList = (overrides: Partial<PackingList> & { items: PackingListItem[] }): PackingList => ({
    id: 'list-1',
    name: 'Paris Trip',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
})

const makeQuestionSet = (overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet => ({
    people: [{ id: 'p1', name: 'Alice' }],
    alwaysNeededItems: [],
    questions: [],
    ...overrides,
})

// ─── deduplicateItems ─────────────────────────────────────────────────────────

describe('deduplicateItems', () => {
    it('keeps a single item when there are no duplicates', () => {
        const items = [makeItem({ itemText: 'Phone charger', personId: 'p1' })]
        expect(deduplicateItems(items)).toHaveLength(1)
    })

    it('removes exact duplicate items for the same person', () => {
        const items = [
            makeItem({ itemText: 'Phone charger', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: 'Phone charger', personId: 'p1', questionId: 'always-needed' }),
        ]
        expect(deduplicateItems(items)).toHaveLength(1)
    })

    it('removes duplicates that differ only in capitalisation', () => {
        const items = [
            makeItem({ itemText: 'Phone Charger', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: 'phone charger', personId: 'p1', questionId: 'always-needed' }),
        ]
        expect(deduplicateItems(items)).toHaveLength(1)
    })

    it('removes duplicates that differ in leading/trailing whitespace', () => {
        const items = [
            makeItem({ itemText: 'Day bag / Backpack', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: ' Day bag / Backpack ', personId: 'p1', questionId: 'always-needed' }),
        ]
        expect(deduplicateItems(items)).toHaveLength(1)
    })

    it('keeps the first occurrence (question-based takes precedence)', () => {
        const questionBased = makeItem({ id: 'first', itemText: 'Phone Charger', personId: 'p1', questionId: 'q1' })
        const alwaysNeeded = makeItem({ id: 'second', itemText: 'phone charger', personId: 'p1', questionId: 'always-needed' })
        const result = deduplicateItems([questionBased, alwaysNeeded])
        expect(result[0].id).toBe('first')
    })

    it('does not deduplicate the same item text across different people', () => {
        const items = [
            makeItem({ itemText: 'Phone charger', personId: 'p1' }),
            makeItem({ itemText: 'Phone charger', personId: 'p2' }),
        ]
        expect(deduplicateItems(items)).toHaveLength(2)
    })

    it('handles multiple duplicates for multiple people', () => {
        const items = [
            makeItem({ itemText: 'Daypack/Backpack', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: 'Day bag / Backpack', personId: 'p1', questionId: 'q2' }),
            makeItem({ itemText: 'Phone Charger', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: 'phone charger', personId: 'p1', questionId: 'always-needed' }),
            makeItem({ itemText: 'Phone Charger', personId: 'p2', questionId: 'q1' }),
            makeItem({ itemText: 'phone charger', personId: 'p2', questionId: 'always-needed' }),
        ]
        // p1: Daypack/Backpack, Day bag / Backpack are different texts → kept; Phone Charger deduped → 3 items
        // p2: Phone Charger deduped → 1 item
        // total: 4
        const result = deduplicateItems(items)
        expect(result).toHaveLength(4)
    })
})

// ─── getUnreviewedCustomItems ─────────────────────────────────────────────────

describe('getUnreviewedCustomItems', () => {
    it('returns empty array when there are no packing lists', () => {
        expect(getUnreviewedCustomItems([], makeQuestionSet())).toHaveLength(0)
    })

    it('returns empty array when all items have a non-empty questionId', () => {
        const list = makePackingList({
            items: [makeItem({ itemText: 'Passport', personId: 'p1', questionId: 'q1' })],
        })
        expect(getUnreviewedCustomItems([list], makeQuestionSet())).toHaveLength(0)
    })

    it('returns an unreviewed custom item', () => {
        const item = makeCustomItem({ itemText: 'Sunscreen SPF50' })
        const list = makePackingList({ items: [item] })
        const result = getUnreviewedCustomItems([list], makeQuestionSet())
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ listId: 'list-1', listName: 'Paris Trip', item })
    })

    it('excludes item with reviewed: true', () => {
        const item = makeCustomItem({ itemText: 'Sunscreen SPF50', reviewed: true })
        const list = makePackingList({ items: [item] })
        expect(getUnreviewedCustomItems([list], makeQuestionSet())).toHaveLength(0)
    })

    it('excludes item whose text matches an alwaysNeededItems entry (case-insensitive)', () => {
        const item = makeCustomItem({ itemText: 'sunscreen spf50' })
        const list = makePackingList({ items: [item] })
        const qs = makeQuestionSet({
            alwaysNeededItems: [{ text: 'Sunscreen SPF50', personSelections: [] }],
        })
        expect(getUnreviewedCustomItems([list], qs)).toHaveLength(0)
    })

    it('excludes item whose text matches an option-nested item in the question set', () => {
        const item = makeCustomItem({ itemText: 'Passport' })
        const list = makePackingList({ items: [item] })
        const qs = makeQuestionSet({
            questions: [
                {
                    id: 'q1',
                    text: 'Documents',
                    order: 0,
                    type: 'saved',
                    options: [
                        {
                            id: 'o1',
                            text: 'Yes',
                            order: 0,
                            items: [{ text: 'Passport', personSelections: [] }],
                        },
                    ],
                },
            ],
        })
        expect(getUnreviewedCustomItems([list], qs)).toHaveLength(0)
    })

    it('returns items from multiple lists with correct listId and listName', () => {
        const list1 = makePackingList({
            id: 'list-1',
            name: 'Paris Trip',
            items: [makeCustomItem({ id: 'c1', itemText: 'Sunscreen' })],
        })
        const list2 = makePackingList({
            id: 'list-2',
            name: 'London Trip',
            items: [makeCustomItem({ id: 'c2', itemText: 'Umbrella' })],
        })
        const result = getUnreviewedCustomItems([list1, list2], makeQuestionSet())
        expect(result).toHaveLength(2)
        expect(result[0].listId).toBe('list-1')
        expect(result[0].listName).toBe('Paris Trip')
        expect(result[1].listId).toBe('list-2')
        expect(result[1].listName).toBe('London Trip')
    })
})

// ─── CreatePackingList – suggestion card ──────────────────────────────────────

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

const mockShowToast = vi.fn()
vi.mock('../components/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

import { CreatePackingList } from './create-packing-list'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)

const testQuestionSet: PackingListQuestionSet = {
    people: [{ id: 'p1', name: 'Alice' }],
    alwaysNeededItems: [],
    questions: [
        {
            id: 'q1',
            text: 'Where are you going?',
            order: 0,
            type: 'saved',
            options: [{ id: 'o1', text: 'Beach', order: 0, items: [] }],
        },
    ],
}

const customItem: PackingListItem = {
    id: 'custom-1',
    itemText: 'Sunscreen SPF50',
    personName: 'Alice',
    personId: '',
    questionId: '',
    optionId: '',
    packed: false,
}

const pastList: PackingList = {
    id: 'past-list-1',
    name: 'Paris Trip',
    createdAt: '2026-01-01T00:00:00Z',
    items: [customItem],
}

function makeDb(overrides: Record<string, unknown> = {}) {
    return {
        getQuestionSet: vi.fn().mockResolvedValue(testQuestionSet),
        getAllPackingLists: vi.fn().mockResolvedValue([pastList]),
        saveQuestionSet: vi.fn().mockResolvedValue({ rev: '2' }),
        savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
        ...overrides,
    }
}

function renderCreatePackingList() {
    return render(
        <MemoryRouter>
            <CreatePackingList />
        </MemoryRouter>
    )
}

describe('CreatePackingList – suggestion card', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({ isLoggedIn: false } as ReturnType<typeof useSolidPod>)
    })

    afterEach(() => {
        cleanup()
    })

    it('does not show suggestion card when there are no unreviewed custom items', async () => {
        const noCustomList: PackingList = {
            ...pastList,
            items: [{ ...customItem, questionId: 'q1', optionId: 'o1', personId: 'p1' }],
        }
        mockUseDatabase.mockReturnValue({
            db: makeDb({ getAllPackingLists: vi.fn().mockResolvedValue([noCustomList]) }),
        } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        // Wait for loading to finish, then confirm no suggestion card
        await waitFor(() => screen.getByText(/Answer the questions below/i))
        expect(screen.queryByText(/past trips/i)).toBeNull()
    })

    it('shows suggestion card when there are unreviewed custom items', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
    })

    it('card body is collapsed by default and expands on click', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))

        // Item text not visible yet
        expect(screen.queryByText('Sunscreen SPF50')).toBeNull()

        // Click expand button
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        screen.getByText('Sunscreen SPF50')
    })

    it('dismissing the card hides it', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))

        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

        expect(screen.queryByText(/past trips you added items/i)).toBeNull()
    })

    it('"Skip" calls db.savePackingList with reviewed:true and removes item from card', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        fireEvent.click(screen.getByRole('button', { name: /skip/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalledWith(
            expect.objectContaining({
                items: expect.arrayContaining([
                    expect.objectContaining({ id: 'custom-1', reviewed: true }),
                ]),
            })
        ))
        expect(screen.queryByText('Sunscreen SPF50')).toBeNull()
    })

    it('"Always include" calls db.saveQuestionSet and db.savePackingList with reviewed:true', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        fireEvent.click(screen.getByRole('button', { name: /always include/i }))

        await waitFor(() => {
            expect(db.saveQuestionSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    alwaysNeededItems: expect.arrayContaining([
                        expect.objectContaining({ text: 'Sunscreen SPF50' }),
                    ]),
                })
            )
            expect(db.savePackingList).toHaveBeenCalledWith(
                expect.objectContaining({
                    items: expect.arrayContaining([
                        expect.objectContaining({ id: 'custom-1', reviewed: true }),
                    ]),
                })
            )
        })
        expect(screen.queryByText('Sunscreen SPF50')).toBeNull()
    })

    it('"Always include" sets selected:true for the matching person in personSelections', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))
        fireEvent.click(screen.getByRole('button', { name: /always include/i }))

        await waitFor(() => expect(db.saveQuestionSet).toHaveBeenCalled())

        const savedQs = db.saveQuestionSet.mock.calls[0][0] as PackingListQuestionSet
        const newItem = savedQs.alwaysNeededItems.find(i => i.text === 'Sunscreen SPF50')
        expect(newItem?.personSelections).toContainEqual({ personId: 'p1', selected: true })
    })

    it('uses updated _rev from first save when processing second item', async () => {
        const secondItem: PackingListItem = {
            ...customItem,
            id: 'custom-2',
            itemText: 'Flip Flops',
        }
        const listWithTwo: PackingList = { ...pastList, _rev: 'rev-1', items: [customItem, secondItem] }
        let saveCallCount = 0
        const savePackingList = vi.fn().mockImplementation(() => {
            saveCallCount++
            return Promise.resolve({ rev: `rev-${saveCallCount + 1}` })
        })
        const db = makeDb({ getAllPackingLists: vi.fn().mockResolvedValue([listWithTwo]), savePackingList })
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        fireEvent.click(screen.getAllByRole('button', { name: /skip/i })[0])
        await waitFor(() => expect(savePackingList).toHaveBeenCalledTimes(1))
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))
        await waitFor(() => expect(savePackingList).toHaveBeenCalledTimes(2))

        // Second save must use the rev returned by the first save, not the original
        const secondCallArg = savePackingList.mock.calls[1][0] as PackingList
        expect(secondCallArg._rev).toBe('rev-2')
    })

    it('card disappears when all items are acted on', async () => {
        const secondItem: PackingListItem = {
            ...customItem,
            id: 'custom-2',
            itemText: 'Flip Flops',
        }
        const listWithTwo: PackingList = { ...pastList, items: [customItem, secondItem] }
        const db = makeDb({ getAllPackingLists: vi.fn().mockResolvedValue([listWithTwo]) })
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        // Skip both
        const skipButtons = screen.getAllByRole('button', { name: /skip/i })
        fireEvent.click(skipButtons[0])
        await waitFor(() => screen.getAllByRole('button', { name: /skip/i }).length < 2)
        const remainingSkip = screen.getByRole('button', { name: /skip/i })
        fireEvent.click(remainingSkip)

        await waitFor(() =>
            expect(screen.queryByText(/past trips you added items/i)).toBeNull()
        )
    })
})
