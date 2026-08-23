import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { getUnreviewedCustomItems, getUnreviewedDeletedItems } from './create-packing-list'
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

const mockNavigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async (importOriginal) => ({
    ...await importOriginal<typeof import('react-router-dom')>(),
    useNavigate: () => mockNavigate,
}))

vi.mock('../services/solidPod', () => ({
    getPrimaryPodUrl: vi.fn(),
    saveRdfToPod: vi.fn(),
    POD_CONTAINERS: { PACKING_LISTS: 'pack-me-up/packing-lists/' },
    POD_ERROR_MESSAGES: { SAVE_FAILED: 'Save failed' },
}))

import { useSolidPod } from '../components/SolidPodContext'
import { useDatabase } from '../components/DatabaseContext'
import { useToast } from '../components/ToastContext'
import { ToastType } from '../components/Toast'
import { PackingAppDatabase } from '../services/database'
import { CreatePackingList } from './create-packing-list'
import { getPrimaryPodUrl, saveRdfToPod } from '../services/solidPod'
import { usePodSync } from '../hooks/usePodSync'

const mockGetPrimaryPodUrl = vi.mocked(getPrimaryPodUrl)
const mockSaveRdfToPod = vi.mocked(saveRdfToPod)
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

    it('excludes custom items belonging to a guest (personId not in question set)', () => {
        const guestItem = makeCustomItem({ itemText: 'Guest snacks', personId: 'guest-uuid-123', personName: 'Dave' })
        const list = makePackingList({ items: [guestItem] })
        expect(getUnreviewedCustomItems([list], makeQuestionSet())).toHaveLength(0)
    })

    it('still includes custom items with empty personId (regular manually-added items)', () => {
        const item = makeCustomItem({ itemText: 'Sunscreen SPF50', personId: '' })
        const list = makePackingList({ items: [item] })
        expect(getUnreviewedCustomItems([list], makeQuestionSet())).toHaveLength(1)
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
        // The card removal re-renders after the awaited save resolves — poll
        // rather than asserting synchronously (flaked on slower CI runners)
        await waitFor(() => expect(screen.queryByText('Sunscreen SPF50')).toBeNull())
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
        await waitFor(() => expect(screen.queryByText('Sunscreen SPF50')).toBeNull())
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

    it('"Add" saves a communal custom item as a shared question-set item', async () => {
        const communalCustom: PackingListItem = {
            id: 'custom-shared-1',
            itemText: 'Camping stove',
            personName: '',
            personId: '',
            questionId: '',
            optionId: '',
            packed: false,
            communal: true,
        }
        const db = makeDb({
            getAllPackingLists: vi.fn().mockResolvedValue([{ ...pastList, items: [communalCustom] }]),
        })
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        // The shared checkbox is pre-checked for items that were communal on the list
        const checkbox = screen.getByRole('checkbox', { name: /shared/i }) as HTMLInputElement
        expect(checkbox.checked).toBe(true)

        fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

        await waitFor(() => expect(db.saveQuestionSet).toHaveBeenCalled())
        const savedQs = db.saveQuestionSet.mock.calls[0][0] as PackingListQuestionSet
        const newItem = savedQs.alwaysNeededItems.find(i => i.text === 'Camping stove')
        expect(newItem?.communal).toBe(true)
        // Everyone selected so the shared item always triggers
        expect(newItem?.personSelections).toContainEqual({ personId: 'p1', selected: true })
    })

    it('checking Shared on a regular suggestion saves it as communal', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))

        const checkbox = screen.getByRole('checkbox', { name: /shared/i }) as HTMLInputElement
        expect(checkbox.checked).toBe(false)
        fireEvent.click(checkbox)
        fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

        await waitFor(() => expect(db.saveQuestionSet).toHaveBeenCalled())
        const savedQs = db.saveQuestionSet.mock.calls[0][0] as PackingListQuestionSet
        const newItem = savedQs.alwaysNeededItems.find(i => i.text === 'Sunscreen SPF50')
        expect(newItem?.communal).toBe(true)
    })

    it('leaving Shared unchecked keeps the per-person save behaviour', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))
        fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

        await waitFor(() => expect(db.saveQuestionSet).toHaveBeenCalled())
        const savedQs = db.saveQuestionSet.mock.calls[0][0] as PackingListQuestionSet
        const newItem = savedQs.alwaysNeededItems.find(i => i.text === 'Sunscreen SPF50')
        expect(newItem?.communal).toBeUndefined()
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
        // The save resolving is not the row going away — wait for the first
        // suggestion to leave before reaching for the remaining Add button
        await waitFor(() => expect(screen.getAllByRole('button', { name: /^add$/i })).toHaveLength(1))
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
        // A returned boolean never fails a waitFor — assert, so this really does
        // wait for the first suggestion to go
        await waitFor(() => expect(screen.getAllByRole('button', { name: /skip/i })).toHaveLength(1))
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

    it('shows a "Sync & Share" button in the page when not logged in and no questions found', () => {
        render(
            <MemoryRouter>
                <CreatePackingList />
            </MemoryRouter>
        )
        expect(screen.getByRole('button', { name: /sync & share/i })).toBeTruthy()
    })

    it('opens the provider selector modal when the login button is clicked', () => {
        render(
            <MemoryRouter>
                <CreatePackingList />
            </MemoryRouter>
        )
        const loginButton = screen.getByRole('button', { name: /sync & share/i })
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
        mockSaveRdfToPod.mockResolvedValue(undefined)
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
            expect(mockSaveRdfToPod).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileUrl: expect.stringContaining('pack-me-up/packing-lists/'),
                    data: expect.objectContaining({ name: 'My New List' }),
                })
            )
        })
    })

    it('does not call saveRdfToPod when not logged in', async () => {
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
        expect(mockSaveRdfToPod).not.toHaveBeenCalled()
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

    it('excludes deleted items belonging to a guest (personId not in question set)', () => {
        const guestItem = makeDeletedItem({ itemText: 'Passport', personId: 'guest-uuid-123' })
        const list = makePackingList({ items: [], deletedItems: [guestItem] })
        const qs = makeQsWithAlwaysNeeded('Passport')
        expect(getUnreviewedDeletedItems([list], qs)).toHaveLength(0)
    })

    it('still includes deleted items with a personId that is in the question set', () => {
        const item = makeDeletedItem({ itemText: 'Passport', personId: 'p1' })
        const list = makePackingList({ items: [], deletedItems: [item] })
        const qs = makeQsWithAlwaysNeeded('Passport')
        expect(getUnreviewedDeletedItems([list], qs)).toHaveLength(1)
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
        await waitFor(() => expect(screen.getAllByRole('button', { name: /keep/i })).toHaveLength(1))
        fireEvent.click(screen.getByRole('button', { name: /keep/i }))

        await waitFor(() => expect(screen.queryByText(/previously removed/i)).toBeNull())
    })
})

// ─── CreatePackingList – skip/keep syncs reviewed flag to pod ────────────────

describe('CreatePackingList – skip syncs reviewed flag to pod', () => {
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
        mockSaveRdfToPod.mockResolvedValue(undefined)
    })

    afterEach(() => {
        cleanup()
    })

    it('pushes the packing list with reviewed:true to the pod after Skip when logged in', async () => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))

        await waitFor(() => expect(mockSaveRdfToPod).toHaveBeenCalledWith(
            expect.objectContaining({
                fileUrl: `https://timgent.solidcommunity.net/pack-me-up/packing-lists/${pastList.id}.ttl`,
                data: expect.objectContaining({
                    items: expect.arrayContaining([
                        expect.objectContaining({ id: 'custom-1', reviewed: true }),
                    ]),
                }),
            })
        ))
    })

    it('does not push to pod after Skip when not logged in', async () => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/past trips you added items/i))
        fireEvent.click(screen.getByRole('button', { name: /review/i }))
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        expect(mockSaveRdfToPod).not.toHaveBeenCalled()
    })
})

describe('CreatePackingList – keep/remove-permanently syncs reviewed flag to pod', () => {
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
        mockSaveRdfToPod.mockResolvedValue(undefined)
    })

    afterEach(() => {
        cleanup()
    })

    it('pushes the packing list with reviewed:true to the pod after Keep when logged in', async () => {
        const db = makeDeletionDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/previously removed/i))
        fireEvent.click(screen.getByRole('button', { name: /review removals/i }))
        fireEvent.click(screen.getByRole('button', { name: /keep/i }))

        await waitFor(() => expect(mockSaveRdfToPod).toHaveBeenCalledWith(
            expect.objectContaining({
                fileUrl: `https://timgent.solidcommunity.net/pack-me-up/packing-lists/${listWithDeletedItem.id}.ttl`,
                data: expect.objectContaining({
                    deletedItems: expect.arrayContaining([
                        expect.objectContaining({ id: 'deleted-item-1', reviewed: true }),
                    ]),
                }),
            })
        ))
    })

    it('does not push to pod after Keep when not logged in', async () => {
        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        const db = makeDeletionDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/previously removed/i))
        fireEvent.click(screen.getByRole('button', { name: /review removals/i }))
        fireEvent.click(screen.getByRole('button', { name: /keep/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        expect(mockSaveRdfToPod).not.toHaveBeenCalled()
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

// ─── CreatePackingList – travellers select-all/none and validation ─────────────

const twoPersonQuestionSet: PackingListQuestionSet = {
    people: [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
    ],
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

function makeTwoPersonDb(overrides: Record<string, unknown> = {}) {
    return {
        getQuestionSet: vi.fn().mockResolvedValue(twoPersonQuestionSet),
        getAllPackingLists: vi.fn().mockResolvedValue([]),
        saveQuestionSet: vi.fn().mockResolvedValue({ rev: '2' }),
        savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
        ...overrides,
    }
}

describe('CreatePackingList – travellers select-all/none and validation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({ isLoggedIn: false } as ReturnType<typeof useSolidPod>)
        mockUseToast.mockReturnValue({ showToast: vi.fn() } as ReturnType<typeof useToast>)
    })

    afterEach(() => {
        cleanup()
    })

    it('shows a select all/none toggle button in the people section', async () => {
        mockUseDatabase.mockReturnValue({ db: makeTwoPersonDb() } as ReturnType<typeof useDatabase>)
        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))
        expect(screen.getByRole('button', { name: /select (all|none)/i })).toBeTruthy()
    })

    it('"Select none" deselects all travellers', async () => {
        mockUseDatabase.mockReturnValue({ db: makeTwoPersonDb() } as ReturnType<typeof useDatabase>)
        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        const toggle = screen.getByRole('button', { name: /select none/i })
        fireEvent.click(toggle)

        const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
        expect(checkboxes.every(cb => !cb.checked)).toBe(true)
    })

    it('"Select all" re-selects all travellers after deselecting', async () => {
        mockUseDatabase.mockReturnValue({ db: makeTwoPersonDb() } as ReturnType<typeof useDatabase>)
        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        fireEvent.click(screen.getByRole('button', { name: /select none/i }))
        fireEvent.click(screen.getByRole('button', { name: /select all/i }))

        const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
        expect(checkboxes.every(cb => cb.checked)).toBe(true)
    })

    it('blocks submission and shows error toast when no travellers are selected', async () => {
        const showToast = vi.fn()
        mockUseToast.mockReturnValue({ showToast } as ReturnType<typeof useToast>)
        const db = makeTwoPersonDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)
        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        fireEvent.click(screen.getByRole('button', { name: /select none/i }))
        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'My Trip' } })
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => expect(showToast).toHaveBeenCalledWith(
            expect.stringMatching(/at least one traveller/i),
            'error'
        ))
        expect(db.savePackingList).not.toHaveBeenCalled()
    })
})

// ─── CreatePackingList – nights away and suggested quantities ─────────────────

describe('CreatePackingList – nights away and suggested quantities', () => {
    const nightsQuestionSet: PackingListQuestionSet = {
        people: [{ id: 'p1', name: 'Alice' }],
        alwaysNeededItems: [
            { text: 'Socks', perNight: 1, personSelections: [{ personId: 'p1', selected: true }] },
            { text: 'Pyjamas', perNight: 1, maxQuantity: 2, personSelections: [{ personId: 'p1', selected: true }] },
            { text: 'Toothbrush', personSelections: [{ personId: 'p1', selected: true }] },
        ],
        questions: [],
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({ isLoggedIn: false } as ReturnType<typeof useSolidPod>)
        mockUseToast.mockReturnValue({ showToast: vi.fn() } as ReturnType<typeof useToast>)
    })

    afterEach(() => {
        cleanup()
    })

    function makeNightsDb() {
        return makeDb({
            getQuestionSet: vi.fn().mockResolvedValue(nightsQuestionSet),
            getAllPackingLists: vi.fn().mockResolvedValue([]),
        })
    }

    it('shows an optional nights input', async () => {
        mockUseDatabase.mockReturnValue({ db: makeNightsDb() } as ReturnType<typeof useDatabase>)
        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))
        expect(screen.getByLabelText(/how many nights away/i)).toBeTruthy()
    })

    it('applies per-night rates and caps to generated items and stores nights on the list', async () => {
        const db = makeNightsDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)
        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'Cornwall' } })
        fireEvent.change(screen.getByLabelText(/how many nights away/i), { target: { value: '3' } })
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const savedList = db.savePackingList.mock.calls[0][0] as PackingList
        expect(savedList.nights).toBe(3)
        expect(savedList.items.find(i => i.itemText === 'Socks')?.quantity).toBe(3)
        expect(savedList.items.find(i => i.itemText === 'Pyjamas')?.quantity).toBe(2)
        expect(savedList.items.find(i => i.itemText === 'Toothbrush')?.quantity).toBeUndefined()
    })

    it('leaves quantities and nights unset when the nights input is left blank', async () => {
        const db = makeNightsDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)
        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'Cornwall' } })
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const savedList = db.savePackingList.mock.calls[0][0] as PackingList
        expect(savedList.nights).toBeUndefined()
        savedList.items.forEach(item => expect(item.quantity).toBeUndefined())
    })
})

// ─── CreatePackingList – trip destination and dates ───────────────────────────

describe('CreatePackingList – trip destination and dates', () => {
    const tripQuestionSet: PackingListQuestionSet = {
        people: [{ id: 'p1', name: 'Alice' }],
        alwaysNeededItems: [
            { text: 'Toothbrush', personSelections: [{ personId: 'p1', selected: true }] },
        ],
        questions: [],
    }

    let showToast: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.clearAllMocks()
        showToast = vi.fn()
        mockUseSolidPod.mockReturnValue({ isLoggedIn: false } as ReturnType<typeof useSolidPod>)
        mockUseToast.mockReturnValue({ showToast } as unknown as ReturnType<typeof useToast>)
    })

    afterEach(() => {
        cleanup()
    })

    function makeTripDb() {
        return makeDb({
            getQuestionSet: vi.fn().mockResolvedValue(tripQuestionSet),
            getAllPackingLists: vi.fn().mockResolvedValue([]),
        })
    }

    async function renderForm() {
        const db = makeTripDb()
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)
        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))
        return db
    }

    it('shows optional destination, start date and end date inputs', async () => {
        await renderForm()

        expect(screen.getByLabelText(/destination/i)).toBeTruthy()
        const start = screen.getByLabelText(/start date/i) as HTMLInputElement
        const end = screen.getByLabelText(/end date/i) as HTMLInputElement
        expect(start.type).toBe('date')
        expect(end.type).toBe('date')
    })

    it('stores the destination and trip dates on the created list', async () => {
        const db = await renderForm()

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'Summer Holiday' } })
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: 'Lisbon, Portugal' } })
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-07-12' } })
        fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-07-19' } })
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const savedList = db.savePackingList.mock.calls[0][0] as PackingList
        expect(savedList.destination).toBe('Lisbon, Portugal')
        expect(savedList.startDate).toBe('2026-07-12')
        expect(savedList.endDate).toBe('2026-07-19')
    })

    it('creates the list without trip details when the fields are left blank', async () => {
        const db = await renderForm()

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'Quick trip' } })
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const savedList = db.savePackingList.mock.calls[0][0] as PackingList
        expect(savedList.destination).toBeUndefined()
        expect(savedList.startDate).toBeUndefined()
        expect(savedList.endDate).toBeUndefined()
    })

    it('trims whitespace around the destination and drops a blank one', async () => {
        const db = await renderForm()

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'Trip' } })
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: '   ' } })
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        expect((db.savePackingList.mock.calls[0][0] as PackingList).destination).toBeUndefined()
    })

    it('keeps a start date with no end date', async () => {
        const db = await renderForm()

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'Trip' } })
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-07-12' } })
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        const savedList = db.savePackingList.mock.calls[0][0] as PackingList
        expect(savedList.startDate).toBe('2026-07-12')
        expect(savedList.endDate).toBeUndefined()
    })

    it('refuses to create a list whose end date is before its start date', async () => {
        const db = await renderForm()

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'Trip' } })
        fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-07-19' } })
        fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-07-12' } })
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))

        await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/end date/i), 'error'))
        expect(db.savePackingList).not.toHaveBeenCalled()
    })
})

describe('CreatePackingList – loading state', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({ isLoggedIn: false } as ReturnType<typeof useSolidPod>)
        mockUseToast.mockReturnValue({ showToast: vi.fn() } as ReturnType<typeof useToast>)
    })

    afterEach(() => {
        cleanup()
    })

    it('uses the shared loading treatment while questions load', () => {
        mockUseDatabase.mockReturnValue({
            db: makeDb({ getQuestionSet: vi.fn(() => new Promise(() => {})) }),
        } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()

        expect(screen.getByRole('status').textContent).toContain('Loading questions...')
        expect(screen.getAllByTestId('loading-skeleton-card').length).toBeGreaterThan(0)
    })

    it('replaces the loading treatment with the questions once they arrive', async () => {
        mockUseDatabase.mockReturnValue({ db: makeDb() } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()

        await waitFor(() => screen.getByText(/Answer the questions below/i))
        expect(screen.queryByRole('status')).toBeNull()
    })

    // The pod → local sync at login walks the whole pod. Waiting for it before
    // reading the device's own copy is seconds of skeleton for questions the
    // page already has.
    it('shows the stored questions without waiting for the pod sync', async () => {
        mockUseDatabase.mockReturnValue({
            db: makeDb(),
            loginSyncVersion: 0,
            loginSyncInProgress: true,
        } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()

        await waitFor(() => screen.getByText(/Answer the questions below/i))
        expect(screen.getByTestId('pod-sync-indicator')).toBeTruthy()
    })

    // Otherwise a device the sync hasn't reached invites the user to redo a
    // setup they have already done.
    it('keeps waiting rather than claiming there are no questions while the pod is still being read', async () => {
        mockUseDatabase.mockReturnValue({
            db: makeDb({ getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }) }),
            loginSyncVersion: 0,
            loginSyncInProgress: true,
        } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()

        await waitFor(() => {
            expect(screen.getByRole('status').textContent).toContain('Loading questions...')
        })
        expect(screen.queryByText(/No Questions Found/i)).toBeNull()
    })

    it('says there are no questions once the pod has been read', async () => {
        mockUseDatabase.mockReturnValue({
            db: makeDb({ getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }) }),
            loginSyncVersion: 0,
            loginSyncInProgress: false,
        } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()

        await waitFor(() => expect(screen.getByText(/No Questions Found/i)).toBeTruthy())
    })
})

// ─── CreatePackingList – landing on the new list ──────────────────────────────

describe('CreatePackingList – landing on the new list', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({ isLoggedIn: false } as ReturnType<typeof useSolidPod>)
    })

    afterEach(() => {
        cleanup()
    })

    async function createAList(showToast = vi.fn()) {
        mockUseToast.mockReturnValue({ showToast } as ReturnType<typeof useToast>)
        const db = makeDb({ getAllPackingLists: vi.fn().mockResolvedValue([]) })
        mockUseDatabase.mockReturnValue({ db } as ReturnType<typeof useDatabase>)

        renderCreatePackingList()
        await waitFor(() => screen.getByText(/Answer the questions below/i))

        fireEvent.change(screen.getByPlaceholderText(/enter a name/i), { target: { value: 'Beach Holiday' } })
        fireEvent.click(screen.getByRole('button', { name: /create packing list/i }))
        await waitFor(() => expect(db.savePackingList).toHaveBeenCalled())
        return db
    }

    it('goes straight to the new list', async () => {
        await createAList()

        await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/view-lists\//))
    })

    it('does not announce the creation in a toast — the list itself says it', async () => {
        const showToast = vi.fn()
        await createAList(showToast)

        await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
        expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/created successfully/i), 'success')
    })
})
