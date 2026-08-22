import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { PackingAppDatabase } from '../services/database'

vi.mock('../components/DatabaseContext', () => ({ useDatabase: vi.fn() }))
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: vi.fn() }))
vi.mock('../components/ForeignPodContext', () => ({ useForeignPod: vi.fn() }))

const saveWithSyncPrevention = vi.fn().mockResolvedValue(undefined)

vi.mock('../hooks/useSyncCoordinator', () => ({
    useSyncCoordinator: vi.fn(() => ({
        saveWithSyncPrevention,
        handleSyncSuccess: vi.fn(),
        handleSyncError: vi.fn(),
    })),
}))

vi.mock('../hooks/usePodSync', () => ({
    usePodSync: vi.fn(() => ({ saveToPod: vi.fn(), syncFromPod: vi.fn() })),
}))

vi.mock('../services/migration', () => ({
    DatabaseMigration: {
        checkMigrationNeeded: vi.fn().mockResolvedValue({ needed: false }),
        performMigration: vi.fn(),
    },
}))

vi.mock('../services/solidPod', () => ({
    POD_CONTAINERS: { ROOT: 'pack-me-up/' },
}))

vi.mock('../services/rdfSerialization', () => ({
    questionSetToDataset: vi.fn(),
    datasetToQuestionSet: vi.fn(),
}))

import { QuestionsPage } from './questions-page'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { useForeignPod } from '../components/ForeignPodContext'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockUseForeignPod = vi.mocked(useForeignPod)

const questionSet = {
    _id: '1',
    _rev: '1',
    people: [{ id: 'p1', name: 'Alice' }],
    alwaysNeededItems: [
        { id: 'i1', text: 'Passport', personSelections: [{ personId: 'p1', selected: true }] },
    ],
    questions: [
        {
            id: 'q1', type: 'saved' as const, order: 0, questionType: 'single-choice' as const,
            text: 'Beach holiday?',
            options: [{
                id: 'o1', order: 0, text: 'Yes', items: [
                    { id: 'i2', text: 'Bucket and spade', personSelections: [{ personId: 'p1', selected: true }] },
                    { id: 'i3', text: 'Sun cream', category: 'Toiletries', personSelections: [{ personId: 'p1', selected: true }] },
                ],
            }],
        },
    ],
}

async function renderPage() {
    mockUseDatabase.mockReturnValue({
        db: {
            getQuestionSet: () => Promise.resolve(structuredClone(questionSet)),
            saveQuestionSet: vi.fn(),
        } as unknown as PackingAppDatabase,
    })
    render(
        <MemoryRouter>
            <QuestionsPage />
        </MemoryRouter>
    )
    await screen.findByText('My Questions & Items')
}

function search(text: string) {
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: text } })
}

describe('QuestionsPage item search', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSolidPod.mockReturnValue({
            isLoggedIn: false,
            session: null,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })
        mockUseForeignPod.mockReturnValue(null)
    })

    afterEach(cleanup)

    it('leaves the page alone until enough has been typed to search on', async () => {
        await renderPage()
        search('s')
        expect(screen.queryByTestId('item-search-results')).toBeNull()
        expect(screen.getByTestId('questions-list').className).not.toContain('hidden')
    })

    it('shows matches with their question, answer and section instead of the list', async () => {
        await renderPage()
        search('sun')
        const results = screen.getByTestId('item-search-results')
        expect(within(results).getByTestId('search-group-crumbs').textContent).toBe('Beach holiday? › Yes')
        expect(within(results).getByTestId('search-section-label').textContent).toBe('Toiletries')
        expect(within(results).getByTestId('item-row').textContent).toContain('Sun cream')
        expect(screen.getByTestId('questions-list').className).toContain('hidden')
    })

    // The list is hidden rather than thrown away, so a search is something you
    // can look at and back out of without losing your place on the page.
    it('puts the page back, still unfolded as it was, when the search is cleared', async () => {
        await renderPage()
        fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
        expect(screen.getByText('Bucket and spade')).toBeTruthy()

        search('sun')
        fireEvent.click(screen.getByRole('button', { name: /Clear search/i }))

        expect(screen.queryByTestId('item-search-results')).toBeNull()
        expect(screen.getByTestId('questions-list').className).not.toContain('hidden')
        expect(screen.getByText('Bucket and spade')).toBeTruthy()
    })

    it('saves an edit made from a result, against the item it found', async () => {
        await renderPage()
        search('sun')
        fireEvent.click(within(screen.getByTestId('item-search-results')).getByTestId('item-row'))
        fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Beach holiday?' } })

        expect(saveWithSyncPrevention).toHaveBeenCalled()
        const saved = saveWithSyncPrevention.mock.calls[0][0]
        const items = saved.questions[0].options[0].items
        expect(items.map((i: { text: string }) => i.text)).toContain('Sun cream')
        expect(items.find((i: { text: string }) => i.text === 'Sun cream').category).toBeUndefined()
    })
})
