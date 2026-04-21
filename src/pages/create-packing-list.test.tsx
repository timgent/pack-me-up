import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { deduplicateItems, getUnreviewedCustomItems, getUnreviewedDeletedItems } from './create-packing-list'
import { PackingListItem, PackingList } from '../create-packing-list/types'
import { PackingListQuestionSet } from '../edit-questions/types'

// ─── shared test factories ────────────────────────────────────────────────────

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(),
}))

vi.mock('../hooks/useHasQuestions', () => ({
    useHasQuestions: vi.fn(),
}))

vi.mock('../hooks/usePodSync', () => ({
    usePodSync: vi.fn().mockReturnValue({
        lastSync: null,
        isSyncing: false,
        error: null,
        saveToPod: vi.fn(),
        syncFromPod: vi.fn(),
    }),
}))

vi.mock('../services/solidPod', () => ({
    getPrimaryPodUrl: vi.fn(),
    saveFileToPod: vi.fn(),
    POD_CONTAINERS: { PACKING_LISTS: 'pack-me-up/packing-lists/' },
    POD_ERROR_MESSAGES: { SAVE_FAILED: 'Save failed' },
}))

import { useSolidPod } from '../components/SolidPodContext'
import { useDatabase } from '../components/DatabaseContext'
import { useToast } from '../components/ToastContext'
import { ToastType } from '../components/Toast'
import { PackingAppDatabase } from '../services/database'
import { CreatePackingList } from './create-packing-list'
import { getPrimaryPodUrl, saveFileToPod } from '../services/solidPod'
import { usePodSync } from '../hooks/usePodSync'

const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockSaveFileToPod = vi.mocked(saveFileToPod)
const mockUsePodSync = vi.mocked(usePodSync)

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockUseDatabase = vi.mocked(useDatabase)
const mockUseToast = vi.mocked(useToast)

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
        mockUseToast.mockReturnValue({ showToast: vi.fn() } as ReturnType<typeof useToast>)
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

    it('"Add" calls db.saveQuestionSet and db.savePackingList with reviewed:true', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

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

    it('"Add" sets selected:true for the matching person in personSelections', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))
        fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

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
        // Wait for the first item to be removed before clicking the remaining skip button
        await waitFor(() => expect(screen.getAllByRole('button', { name: /skip/i })).toHaveLength(1))
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))
        await waitFor(() => expect(savePackingList).toHaveBeenCalledTimes(2))

        // Second save must use the rev returned by the first save, not the original
        const secondCallArg = savePackingList.mock.calls[1][0] as PackingList
        expect(secondCallArg._rev).toBe('rev-2')
    })

    it('destination select renders with "Always Needed Items" default and question/option entries', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        const select = screen.getByRole('combobox', { name: /destination for sunscreen spf50/i })
        expect(select).toBeDefined()
        const options = Array.from((select as HTMLSelectElement).options).map(o => o.text)
        expect(options).toContain('Always Needed Items')
        expect(options).toContain('Where are you going?: Beach')
        expect((select as HTMLSelectElement).value).toBe('always')
    })

    it('"Add" with default selection adds to alwaysNeededItems', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        // default is "always" — don't change the select
        fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

        await waitFor(() => expect(db.saveQuestionSet).toHaveBeenCalledWith(
            expect.objectContaining({
                alwaysNeededItems: expect.arrayContaining([
                    expect.objectContaining({ text: 'Sunscreen SPF50' }),
                ]),
            })
        ))
        const savedQs = db.saveQuestionSet.mock.calls[0][0] as PackingListQuestionSet
        expect(savedQs.questions[0].options[0].items).toHaveLength(0)
    })

    it('"Add" with a question/option selected adds to that option\'s items, not alwaysNeededItems', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        const select = screen.getByRole('combobox', { name: /destination for sunscreen spf50/i })
        fireEvent.change(select, { target: { value: 'q1::o1' } })

        fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

        await waitFor(() => expect(db.saveQuestionSet).toHaveBeenCalled())
        const savedQs = db.saveQuestionSet.mock.calls[0][0] as PackingListQuestionSet
        expect(savedQs.alwaysNeededItems).toHaveLength(0)
        expect(savedQs.questions[0].options[0].items).toContainEqual(
            expect.objectContaining({ text: 'Sunscreen SPF50' })
        )
    })

    it('"Add" uses updated _rev from first save when processing second item', async () => {
        const secondItem: PackingListItem = {
            ...customItem,
            id: 'custom-2',
            itemText: 'Flip Flops',
        }
        const listWithTwo: PackingList = { ...pastList, items: [customItem, secondItem] }
        let qsSaveCount = 0
        const saveQuestionSet = vi.fn().mockImplementation(() => {
            qsSaveCount++
            return Promise.resolve({ rev: `qs-rev-${qsSaveCount + 1}` })
        })
        const db = makeDb({ getAllPackingLists: vi.fn().mockResolvedValue([listWithTwo]), saveQuestionSet })
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        fireEvent.click(screen.getAllByRole('button', { name: /^add$/i })[0])
        await waitFor(() => expect(saveQuestionSet).toHaveBeenCalledTimes(1))
        fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
        await waitFor(() => expect(saveQuestionSet).toHaveBeenCalledTimes(2))

        // Second save must use the _rev returned by the first save
        const secondCallArg = saveQuestionSet.mock.calls[1][0] as PackingListQuestionSet
        expect(secondCallArg._rev).toBe('qs-rev-2')
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

describe('CreatePackingList - login button', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({ db: null as unknown as PackingAppDatabase })
        mockUseToast.mockReturnValue({ showToast: vi.fn() as (message: string, type: ToastType) => void })
    })

    it('shows a "Login with Solid Pod" button in the page when not logged in and no questions found', () => {
        render(
            <MemoryRouter>
                <CreatePackingList />
            </MemoryRouter>
        )
        expect(screen.getByRole('button', { name: /login with solid pod/i })).toBeTruthy()
    })

    it('opens the provider selector modal when the login button is clicked', () => {
        render(
            <MemoryRouter>
                <CreatePackingList />
            </MemoryRouter>
        )
        const loginButton = screen.getByRole('button', { name: /login with solid pod/i })
        fireEvent.click(loginButton)
        expect(screen.getByRole('dialog')).toBeTruthy()
    })
})

describe('CreatePackingList – pod sync on creation', () => {
    const loggedInSession = { fetch: vi.fn() } as ReturnType<typeof useSolidPod>['session']

    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({
            session: loggedInSession,
            isLoggedIn: true,
            webId: 'https://timgent.solidcommunity.net/profile/card#me',
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseToast.mockReturnValue({ showToast: vi.fn() } as ReturnType<typeof useToast>)
        mockGetPrimaryPodUrl.mockResolvedValue('https://timgent.solidcommunity.net/')
        mockSaveFileToPod.mockResolvedValue(undefined)
    })

    afterEach(() => {
        cleanup()
    })

    it('syncs the newly created list to the pod immediately after saving', async () => {
        mockUseDatabase.mockReturnValue({
            db: makeDb({ getAllPackingLists: vi.fn().mockResolvedValue([]) }),
        } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'My New List' } })
        fireEvent.click(screen.getByRole('radio', { name: /beach/i }))
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => {
            expect(mockSaveFileToPod).toHaveBeenCalledWith(
                expect.objectContaining({
                    containerPath: 'https://timgent.solidcommunity.net/pack-me-up/packing-lists/',
                    data: expect.objectContaining({ name: 'My New List' }),
                })
            )
        })
    })

    it('does not call saveFileToPod when not logged in', async () => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        const db = makeDb({ getAllPackingLists: vi.fn().mockResolvedValue([]) })
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'My New List' } })
        fireEvent.click(screen.getByRole('radio', { name: /beach/i }))
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => expect(vi.mocked(db.savePackingList)).toHaveBeenCalled())
        expect(mockSaveFileToPod).not.toHaveBeenCalled()
    })
})

// ─── getUnreviewedDeletedItems ────────────────────────────────────────────────

const makeDeletedItem = (overrides: Partial<PackingListItem> = {}): PackingListItem => ({
    id: 'deleted-1',
    itemText: 'Passport',
    personName: 'Alice',
    personId: 'p1',
    questionId: 'always-needed',
    optionId: 'always-needed',
    packed: false,
    ...overrides,
})

const makeQsWithAlwaysNeeded = (itemText: string): PackingListQuestionSet => ({
    people: [{ id: 'p1', name: 'Alice' }],
    alwaysNeededItems: [{ text: itemText, personSelections: [] }],
    questions: [],
})

describe('getUnreviewedDeletedItems', () => {
    it('returns empty array when no lists have deletedItems', () => {
        const list = makePackingList({ items: [] })
        expect(getUnreviewedDeletedItems([list], makeQuestionSet())).toHaveLength(0)
    })

    it('returns empty array when deletedItems is empty', () => {
        const list = makePackingList({ items: [], deletedItems: [] })
        expect(getUnreviewedDeletedItems([list], makeQuestionSet())).toHaveLength(0)
    })

    it('returns an unreviewed deleted item that still exists in the question set', () => {
        const item = makeDeletedItem()
        const list = makePackingList({ items: [], deletedItems: [item] })
        const qs = makeQsWithAlwaysNeeded('Passport')
        const result = getUnreviewedDeletedItems([list], qs)
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ listId: 'list-1', listName: 'Paris Trip', item })
    })

    it('excludes deleted item with reviewed: true', () => {
        const item = makeDeletedItem({ reviewed: true })
        const list = makePackingList({ items: [], deletedItems: [item] })
        const qs = makeQsWithAlwaysNeeded('Passport')
        expect(getUnreviewedDeletedItems([list], qs)).toHaveLength(0)
    })

    it('excludes deleted item whose text is no longer in the question set', () => {
        const item = makeDeletedItem({ itemText: 'Old Item' })
        const list = makePackingList({ items: [], deletedItems: [item] })
        expect(getUnreviewedDeletedItems([list], makeQuestionSet())).toHaveLength(0)
    })

    it('returns deleted items from question options when still in question set', () => {
        const item = makeDeletedItem({ itemText: 'Sunscreen', questionId: 'q1', optionId: 'o1' })
        const list = makePackingList({ items: [], deletedItems: [item] })
        const qs: PackingListQuestionSet = {
            ...makeQuestionSet(),
            questions: [{
                id: 'q1', text: 'Beach', order: 0, type: 'saved',
                options: [{ id: 'o1', text: 'Yes', order: 0, items: [{ text: 'Sunscreen', personSelections: [] }] }],
            }],
        }
        expect(getUnreviewedDeletedItems([list], qs)).toHaveLength(1)
    })

    it('returns deleted items from multiple lists with correct listId and listName', () => {
        const list1 = makePackingList({
            id: 'list-1', name: 'Paris Trip',
            items: [], deletedItems: [makeDeletedItem({ id: 'd1', itemText: 'Passport' })],
        })
        const list2 = makePackingList({
            id: 'list-2', name: 'London Trip',
            items: [], deletedItems: [makeDeletedItem({ id: 'd2', itemText: 'Passport' })],
        })
        const qs = makeQsWithAlwaysNeeded('Passport')
        const result = getUnreviewedDeletedItems([list1, list2], qs)
        expect(result).toHaveLength(2)
        expect(result[0].listId).toBe('list-1')
        expect(result[1].listId).toBe('list-2')
    })
})

// ─── CreatePackingList – deletion suggestion card ─────────────────────────────

const deletedItem: PackingListItem = {
    id: 'deleted-item-1',
    itemText: 'Passport',
    personName: 'Alice',
    personId: 'p1',
    questionId: 'always-needed',
    optionId: 'always-needed',
    packed: false,
}

const testQsWithPassport: PackingListQuestionSet = {
    people: [{ id: 'p1', name: 'Alice' }],
    alwaysNeededItems: [{ text: 'Passport', personSelections: [{ personId: 'p1', selected: true }] }],
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

const listWithDeletedItem: PackingList = {
    id: 'past-list-2',
    name: 'Rome Trip',
    createdAt: '2026-02-01T00:00:00Z',
    items: [],
    deletedItems: [deletedItem],
}

function makeDeletionDb(overrides: Record<string, unknown> = {}) {
    return {
        getQuestionSet: vi.fn().mockResolvedValue(testQsWithPassport),
        getAllPackingLists: vi.fn().mockResolvedValue([listWithDeletedItem]),
        saveQuestionSet: vi.fn().mockResolvedValue({ rev: '2' }),
        savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
        ...overrides,
    }
}

describe('CreatePackingList – deletion suggestion card', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({ isLoggedIn: false } as ReturnType<typeof useSolidPod>)
        mockUseToast.mockReturnValue({ showToast: vi.fn() } as ReturnType<typeof useToast>)
    })

    afterEach(() => {
        cleanup()
    })

    it('does not show deletion card when there are no unreviewed deleted items', async () => {
        const noDeleted: PackingList = { ...listWithDeletedItem, deletedItems: [] }
        mockUseDatabase.mockReturnValue({
            db: makeDeletionDb({ getAllPackingLists: vi.fn().mockResolvedValue([noDeleted]) }),
        } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))
        expect(screen.queryByText(/previously removed/i)).toBeNull()
    })

    it('shows deletion card when there are unreviewed deleted items', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDeletionDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/previously removed/i))
    })

    it('deletion card is collapsed by default and expands on click', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDeletionDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/previously removed/i))

        expect(screen.queryByText('Passport')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /review removals/i }))
        screen.getByText('Passport')
    })

    it('dismissing the deletion card hides it', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDeletionDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/previously removed/i))

        fireEvent.click(screen.getByRole('button', { name: /dismiss removals/i }))
        expect(screen.queryByText(/previously removed/i)).toBeNull()
    })

    it('"Keep" marks the deletedItems entry as reviewed:true via db.savePackingList', async () => {
        const db = makeDeletionDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/previously removed/i))
        fireEvent.click(screen.getByRole('button', { name: /review removals/i }))
        fireEvent.click(screen.getByRole('button', { name: /keep/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalledWith(
            expect.objectContaining({
                deletedItems: expect.arrayContaining([
                    expect.objectContaining({ id: 'deleted-item-1', reviewed: true }),
                ]),
            })
        ))
        expect(screen.queryByText('Passport')).toBeNull()
    })

    it('"Remove permanently" removes item from alwaysNeededItems and marks reviewed', async () => {
        const db = makeDeletionDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/previously removed/i))
        fireEvent.click(screen.getByRole('button', { name: /review removals/i }))
        fireEvent.click(screen.getByRole('button', { name: /remove permanently/i }))

        await waitFor(() => {
            expect(db.saveQuestionSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    alwaysNeededItems: expect.not.arrayContaining([
                        expect.objectContaining({ text: 'Passport' }),
                    ]),
                })
            )
            expect(db.savePackingList).toHaveBeenCalledWith(
                expect.objectContaining({
                    deletedItems: expect.arrayContaining([
                        expect.objectContaining({ id: 'deleted-item-1', reviewed: true }),
                    ]),
                })
            )
        })
        expect(screen.queryByText('Passport')).toBeNull()
    })

    it('deletion card disappears when all items are acted on', async () => {
        const secondDeleted: PackingListItem = {
            ...deletedItem, id: 'deleted-item-2', itemText: 'Passport',
        }
        const listWithTwo: PackingList = {
            ...listWithDeletedItem,
            deletedItems: [deletedItem, secondDeleted],
        }
        const db = makeDeletionDb({ getAllPackingLists: vi.fn().mockResolvedValue([listWithTwo]) })
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/previously removed/i))
        fireEvent.click(screen.getByRole('button', { name: /review removals/i }))

        const keepButtons = screen.getAllByRole('button', { name: /keep/i })
        fireEvent.click(keepButtons[0])
        await waitFor(() => screen.getAllByRole('button', { name: /keep/i }).length < 2)
        fireEvent.click(screen.getByRole('button', { name: /keep/i }))

        await waitFor(() => expect(screen.queryByText(/previously removed/i)).toBeNull())
    })
})

// ─── CreatePackingList – question set pod sync on mount ───────────────────────

describe('CreatePackingList – question set pod sync on mount', () => {
    const localQuestionSet: PackingListQuestionSet = {
        ...testQuestionSet,
        lastModified: '2024-01-01T10:00:00.000Z',
    }

    function makeSyncDb(overrides: Record<string, unknown> = {}) {
        return {
            getQuestionSet: vi.fn().mockResolvedValue(localQuestionSet),
            getAllPackingLists: vi.fn().mockResolvedValue([]),
            saveQuestionSet: vi.fn().mockResolvedValue({ rev: 'rev-synced' }),
            savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
            ...overrides,
        }
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockUsePodSync.mockReturnValue({
            lastSync: null,
            isSyncing: false,
            error: null,
            saveToPod: vi.fn(),
            syncFromPod: vi.fn(),
        })
        mockUseToast.mockReturnValue({ showToast: vi.fn() } as ReturnType<typeof useToast>)
    })

    afterEach(() => {
        cleanup()
    })

    it('calls usePodSync with syncOnMount:true for the question set when logged in', async () => {
        mockUseSolidPod.mockReturnValue({
            session: null, isLoggedIn: true, webId: 'https://example.com/profile#me',
            isLoading: false, login: vi.fn(), logout: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({ db: makeSyncDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        expect(mockUsePodSync).toHaveBeenCalledWith(
            expect.objectContaining({
                syncOnMount: true,
                enabled: true,
                pathConfig: expect.objectContaining({ filename: 'packing-list-questions.ttl' }),
            })
        )
    })

    it('does not enable usePodSync for question set when not logged in', async () => {
        mockUseSolidPod.mockReturnValue({
            session: null, isLoggedIn: false, webId: undefined,
            isLoading: false, login: vi.fn(), logout: vi.fn(),
        })
        mockUseDatabase.mockReturnValue({ db: makeSyncDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        expect(mockUsePodSync).toHaveBeenCalledWith(
            expect.objectContaining({
                syncOnMount: true,
                enabled: false,
            })
        )
    })

    it('updates the displayed question set when pod data is newer', async () => {
        mockUseSolidPod.mockReturnValue({
            session: null, isLoggedIn: true, webId: 'https://example.com/profile#me',
            isLoading: false, login: vi.fn(), logout: vi.fn(),
        })
        const db = makeSyncDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        // Capture the onSyncSuccess callback
        let capturedOnSyncSuccess: ((data: PackingListQuestionSet) => void) | undefined
        mockUsePodSync.mockImplementation((opts) => {
            capturedOnSyncSuccess = opts.onSyncSuccess as (data: PackingListQuestionSet) => void
            return { lastSync: null, isSyncing: false, error: null, saveToPod: vi.fn(), syncFromPod: vi.fn() }
        })

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        // Simulate pod returning a newer question set with an extra person
        const newerPodQs: PackingListQuestionSet = {
            ...testQuestionSet,
            lastModified: '2024-06-01T12:00:00.000Z',
            people: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
        }
        await act(async () => {
            capturedOnSyncSuccess!(newerPodQs)
        })

        await waitFor(() => expect(db.saveQuestionSet).toHaveBeenCalledWith(
            expect.objectContaining({ lastModified: newerPodQs.lastModified })
        ))
    })

    it('does not overwrite local question set when pod data is older', async () => {
        mockUseSolidPod.mockReturnValue({
            session: null, isLoggedIn: true, webId: 'https://example.com/profile#me',
            isLoading: false, login: vi.fn(), logout: vi.fn(),
        })
        const db = makeSyncDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        let capturedOnSyncSuccess: ((data: PackingListQuestionSet) => void) | undefined
        mockUsePodSync.mockImplementation((opts) => {
            capturedOnSyncSuccess = opts.onSyncSuccess as (data: PackingListQuestionSet) => void
            return { lastSync: null, isSyncing: false, error: null, saveToPod: vi.fn(), syncFromPod: vi.fn() }
        })

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        // Simulate pod returning an OLDER question set
        const olderPodQs: PackingListQuestionSet = {
            ...testQuestionSet,
            lastModified: '2023-01-01T00:00:00.000Z',
        }
        await act(async () => {
            capturedOnSyncSuccess!(olderPodQs)
        })

        expect(db.saveQuestionSet).not.toHaveBeenCalled()
    })
})
