import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { PackingAppDatabase } from '../services/database'

vi.mock('../components/DatabaseContext', () => ({ useDatabase: vi.fn() }))
vi.mock('../components/SolidPodContext', () => ({ useSolidPod: vi.fn() }))
vi.mock('../components/ForeignPodContext', () => ({ useForeignPod: vi.fn() }))

vi.mock('../hooks/useSyncCoordinator', () => ({
    useSyncCoordinator: vi.fn(() => ({
        saveWithSyncPrevention: vi.fn(),
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

const emptyQuestionSet = { _id: '1', _rev: '1', questions: [], people: [], alwaysNeededItems: [] }

const populatedQuestionSet = {
    _id: '1',
    _rev: '1',
    questions: [],
    people: [{ id: 'p1', name: 'Alice', personSelections: [] }],
    alwaysNeededItems: [],
}

function renderQuestionsPage(questionSet: unknown) {
    mockUseDatabase.mockReturnValue({
        db: { getQuestionSet: () => Promise.resolve(questionSet), saveQuestionSet: vi.fn() } as unknown as PackingAppDatabase,
        loginSyncInProgress: false,
        loginSyncVersion: 0,
    })
    return render(
        <MemoryRouter>
            <QuestionsPage />
        </MemoryRouter>
    )
}

describe('QuestionsPage empty state', () => {
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

    afterEach(() => {
        cleanup()
    })

    // A page of empty scaffolding with no suggestion of what to do with it is
    // where a new user gives up.
    it('offers a way forward when there is nothing set up yet', async () => {
        renderQuestionsPage(emptyQuestionSet)

        const emptyState = await screen.findByTestId('questions-empty-state')
        expect(emptyState.textContent).toMatch(/nothing here yet/i)
    })

    it('points the empty state at the setup wizard', async () => {
        renderQuestionsPage(emptyQuestionSet)

        await screen.findByTestId('questions-empty-state')
        const wizardLink = screen.getByRole('link', { name: /setup wizard/i })
        expect(wizardLink.getAttribute('href')).toBe('/wizard')
    })

    // The wizard isn't the only route in — someone who wants to build their own
    // set from scratch should still find the manual one.
    it('leaves the manual route in place alongside the empty state', async () => {
        renderQuestionsPage(emptyQuestionSet)

        await screen.findByTestId('questions-empty-state')
        expect(screen.getByRole('button', { name: /add question/i })).toBeTruthy()
    })

    // "Redo the setup wizard" is wrong advice for someone who has never done it.
    it('does not also offer to redo a wizard that was never done', async () => {
        renderQuestionsPage(emptyQuestionSet)

        await screen.findByTestId('questions-empty-state')
        expect(screen.queryByText(/redo the setup wizard/i)).toBeNull()
    })

    it('drops the empty state once there is something set up', async () => {
        renderQuestionsPage(populatedQuestionSet)

        await waitFor(() => expect(screen.getByText('My Questions & Items')).toBeTruthy())
        expect(screen.queryByTestId('questions-empty-state')).toBeNull()
        expect(screen.getByText(/redo the setup wizard/i)).toBeTruthy()
    })

    // Someone else's pod is not somewhere you can run your setup wizard.
    it('keeps the wizard out of an empty pod that belongs to somebody else', async () => {
        mockUseForeignPod.mockReturnValue({ foreignPodUrl: 'https://friend.example/' } as ReturnType<typeof useForeignPod>)
        renderQuestionsPage(emptyQuestionSet)

        await waitFor(() => expect(screen.getByText('Questions & Items')).toBeTruthy())
        expect(screen.queryByTestId('questions-empty-state')).toBeNull()
        expect(screen.queryByRole('link', { name: /setup wizard/i })).toBeNull()
    })
})
