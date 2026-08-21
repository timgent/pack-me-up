import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ViewPackingList } from './view-packing-list'
import type { PackingAppDatabase } from '../services/database'
import { PERSON_COLORS, personColorAt } from '../edit-questions/person-colors'

vi.mock('../components/DatabaseContext', () => ({ useDatabase: vi.fn() }))
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: vi.fn() }))
vi.mock('../components/ToastContext', () => ({ useToast: vi.fn(() => ({ showToast: vi.fn() })) }))
vi.mock('../hooks/usePodSync', () => ({ usePodSync: vi.fn() }))
vi.mock('../hooks/useSyncCoordinator', () => ({ useSyncCoordinator: vi.fn() }))
vi.mock('../components/SharePackingListModal', () => ({ SharePackingListModal: vi.fn(() => null) }))
vi.mock('../hooks/useSharedListsSync', () => ({
    useSharedListsSync: vi.fn(() => ({
        sharedListsWithMe: { lists: [], lastModified: '' },
        saveSharedListsWithMe: vi.fn().mockResolvedValue(null),
    })),
}))
vi.mock('../services/solidPod', () => ({
    POD_CONTAINERS: { PACKING_LISTS: 'pack-me-up/packing-lists/', SHARED_LISTS_WITH_ME: 'pack-me-up/shared-lists-with-me.ttl' },
    getPrimaryPodUrl: vi.fn().mockResolvedValue('https://own.solidcommunity.net/'),
    saveRdfToPod: vi.fn().mockResolvedValue(undefined),
    resolveOwnerDisplayName: vi.fn(() => 'owner'),
    deriveWebIdFromPodUrl: vi.fn((url: string) => `${url}profile/card#me`),
}))

import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { usePodSync } from '../hooks/usePodSync'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'

const packingList = {
    id: 'colour-list',
    name: 'Colour Trip',
    createdAt: '2026-01-01T00:00:00Z',
    guests: [{ id: 'g1', name: 'Zoe' }],
    items: [
        { id: 'i1', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false, category: 'Essentials' },
        { id: 'i2', itemText: 'Nappies', personName: 'Bob', personId: 'p2', questionId: 'q1', optionId: 'o1', packed: false, category: 'Essentials' },
        { id: 'i3', itemText: 'Sun hat', personName: 'Zoe', personId: 'g1', questionId: 'q2', optionId: 'o2', packed: false, category: 'Beach' },
    ],
}

// Bob has picked a colour; Alice never has, so she keeps the one her position
// gives her. Zoe is a guest — the question set has never heard of her.
const questionSet = {
    people: [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob', color: 'pink' as const },
    ],
    alwaysNeededItems: [],
    questions: [],
}

function makeDb() {
    return {
        getPackingList: vi.fn().mockResolvedValue(packingList),
        savePackingList: vi.fn().mockResolvedValue({ rev: '2' }),
        getQuestionSet: vi.fn().mockResolvedValue(questionSet),
        getSharedListsWithMe: vi.fn().mockResolvedValue({ lists: [], lastModified: '' }),
        saveSharedListsWithMe: vi.fn().mockResolvedValue({ rev: '1' }),
    }
}

function renderList() {
    return render(
        <MemoryRouter initialEntries={['/view-list/colour-list']}>
            <Routes>
                <Route path="/view-list/:id" element={<ViewPackingList />} />
            </Routes>
        </MemoryRouter>
    )
}

/** The card whose heading names this person. */
function cardFor(name: string): HTMLElement {
    const heading = screen.getByRole('button', { name: new RegExp(`Collapse ${name}'s list`) })
    return heading.closest('[data-testid="list-section"]') as HTMLElement
}

const pink = PERSON_COLORS.find(c => c.id === 'pink')!

beforeEach(() => {
    localStorage.clear()
    vi.mocked(useSolidPod).mockReturnValue({
        isLoggedIn: false, session: null, webId: undefined, isLoading: false, login: vi.fn(), logout: vi.fn(),
    })
    vi.mocked(usePodSync).mockReturnValue({ saveToPod: vi.fn() })
    vi.mocked(useSyncCoordinator).mockReturnValue({
        syncingFromPod: false,
        handleSyncSuccess: vi.fn(),
        handleSyncError: vi.fn(),
        saveWithSyncPrevention: vi.fn().mockResolvedValue({ ...packingList, _rev: '2' }),
    })
    vi.mocked(useDatabase).mockReturnValue({ db: makeDb() as unknown as PackingAppDatabase })
})

describe('ViewPackingList person colours', () => {
    it('marks each person’s card with their coloured initial', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        await waitFor(() =>
            expect(within(cardFor('Bob')).getByTestId('person-avatar').className).toContain(pink.avatar))
        expect(within(cardFor('Alice')).getByTestId('person-avatar').className)
            .toContain(personColorAt(0).avatar)
    })

    it('outlines the card in the same colour', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Nappies')).toBeTruthy())

        await waitFor(() => expect(cardFor('Bob').className).toContain(pink.border))
        expect(cardFor('Alice').className).toContain(personColorAt(0).border)
    })

    it('gives a guest a colour nobody else on the list is wearing', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Sun hat')).toBeTruthy())

        // Alice holds position 0 and Bob chose pink, so the first colour going
        // spare is position 1's.
        await waitFor(() =>
            expect(within(cardFor('Zoe')).getByTestId('person-avatar').className)
                .toContain(personColorAt(1).avatar))
        expect(within(cardFor('Zoe')).getByTestId('person-avatar').className)
            .not.toContain(pink.avatar)
    })

    it('carries the colours into the category grid', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: 'Category View' }))

        // Everyone is marked the same way here as on their own card
        const bob = (await screen.findAllByRole('button', { name: /everything left for Bob/i }))[0]
        await waitFor(() => expect(within(bob).getByTestId('person-avatar').className).toContain(pink.avatar))
        const alice = screen.getAllByRole('button', { name: /everything left for Alice/i })[0]
        expect(within(alice).getByTestId('person-avatar').className).toContain(personColorAt(0).avatar)
    })

    it('leaves the shared card unmarked — it belongs to nobody in particular', async () => {
        renderList()
        await waitFor(() => expect(screen.getByText('Toothbrush')).toBeTruthy())

        fireEvent.click(screen.getByRole('button', { name: /Add Shared Items/i }))
        const sharedHeading = await screen.findByRole('button', { name: /Collapse the shared items list/ })
        const sharedCard = sharedHeading.closest('[data-testid="list-section"]') as HTMLElement
        expect(within(sharedCard).queryByTestId('person-avatar')).toBeNull()
    })
})
