import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
/** A person's chip in the "Packing for" strip. */
function chipFor(name: string): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^${name}`) })
}

/** A row of the grid, by the button carrying its name. */
function row(itemText: string) {
    return screen.getByRole('button', { name: `Edit ${itemText}` })
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
    it('marks each person in the filter strip with their coloured initial', async () => {
        renderList()
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        await waitFor(() =>
            expect(within(chipFor('Bob')).getByTestId('person-avatar').className).toContain(pink.avatar))
        expect(within(chipFor('Alice')).getByTestId('person-avatar').className)
            .toContain(personColorAt(0).avatar)
    })

    it('carries the same colour onto that person’s cells in the grid', async () => {
        renderList()
        await waitFor(() => expect(row('Nappies')).toBeTruthy())

        // Unpacked, so the disc is outlined in their colour rather than filled
        await waitFor(() => expect(screen.getByTestId('grid-cell-i2').className).toContain(pink.border))
        expect(screen.getByTestId('grid-cell-i1').className).toContain(personColorAt(0).border)
    })

    it('gives a guest a colour nobody else on the list is wearing', async () => {
        renderList()
        await waitFor(() => expect(row('Sun hat')).toBeTruthy())

        // Alice holds position 0 and Bob chose pink, so the first colour going
        // spare is position 1's.
        await waitFor(() =>
            expect(within(chipFor('Zoe')).getByTestId('person-avatar').className)
                .toContain(personColorAt(1).avatar))
        expect(within(chipFor('Zoe')).getByTestId('person-avatar').className)
            .not.toContain(pink.avatar)
    })

    it('tells two people who share a first letter apart by more than colour', async () => {
        // Colour alone is no answer for someone who cannot separate two of them,
        // and with person view gone there is no list of names to fall back to.
        renderList()
        await waitFor(() => expect(row('Toothbrush')).toBeTruthy())

        expect(within(chipFor('Alice')).getByTestId('person-avatar').textContent).toBe('A')
        expect(within(chipFor('Bob')).getByTestId('person-avatar').textContent).toBe('B')
        expect(within(chipFor('Zoe')).getByTestId('person-avatar').textContent).toBe('Z')
    })
})
