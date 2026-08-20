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

const storedQuestionSet = {
    _id: '1',
    _rev: '1',
    questions: [],
    people: [{ id: 'p1', name: 'Alice', personSelections: [] }],
    alwaysNeededItems: [],
}

function renderQuestionsPage(getQuestionSet: () => Promise<unknown>, databaseContext: Record<string, unknown> = {}) {
    mockUseDatabase.mockReturnValue({
        db: { getQuestionSet, saveQuestionSet: vi.fn() } as unknown as PackingAppDatabase,
        ...databaseContext,
    })
    return render(
        <MemoryRouter>
            <QuestionsPage />
        </MemoryRouter>
    )
}

describe('QuestionsPage loading state', () => {
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

    it('uses the shared loading treatment while the question set loads', async () => {
        renderQuestionsPage(() => new Promise(() => {}))

        await waitFor(() => {
            expect(screen.getByRole('status').textContent).toContain('Loading questions & items...')
        })
        expect(screen.getAllByTestId('loading-skeleton-card').length).toBeGreaterThan(0)
    })

    it('replaces the loading treatment with the real content once the question set arrives', async () => {
        renderQuestionsPage(() => Promise.resolve(emptyQuestionSet))

        await waitFor(() => expect(screen.getByText('My Questions & Items')).toBeTruthy())
        expect(screen.queryByRole('status')).toBeNull()
    })

    // The pod → local sync at login walks the whole pod. Waiting for it before
    // reading the device's own copy is seconds of skeleton for data the page
    // already has.
    it('shows the stored question set without waiting for the pod sync', async () => {
        renderQuestionsPage(() => Promise.resolve(storedQuestionSet), { loginSyncInProgress: true, loginSyncVersion: 0 })

        expect(await screen.findByText('My Questions & Items')).toBeTruthy()
    })

    it('flags that the pod is still being read', async () => {
        renderQuestionsPage(() => Promise.resolve(storedQuestionSet), { loginSyncInProgress: true, loginSyncVersion: 0 })

        await screen.findByText('My Questions & Items')
        expect(screen.getByTestId('pod-sync-indicator')).toBeTruthy()
    })

    // Otherwise a fresh device tells the user their questions are gone, and
    // invites them to redo a setup they have already done.
    it('keeps waiting rather than showing an empty set while the pod is still being read', async () => {
        renderQuestionsPage(
            () => Promise.reject({ name: 'not_found' }),
            { loginSyncInProgress: true, loginSyncVersion: 0 },
        )

        await waitFor(() => {
            expect(screen.getByRole('status').textContent).toContain('Loading questions & items...')
        })
        expect(screen.queryByText('My Questions & Items')).toBeNull()
    })

    it('shows the empty set once the pod has been read', async () => {
        renderQuestionsPage(
            () => Promise.reject({ name: 'not_found' }),
            { loginSyncInProgress: false, loginSyncVersion: 0 },
        )

        await waitFor(() => expect(screen.getByText('My Questions & Items')).toBeTruthy())
    })
})
