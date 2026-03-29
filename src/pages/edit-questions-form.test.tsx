import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { EditQuestionsForm } from './edit-questions-form'
import type { PackingAppDatabase } from '../services/database'

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(() => ({ showToast: vi.fn() })),
}))

vi.mock('../hooks/usePodSync', () => ({
    usePodSync: vi.fn(),
}))

vi.mock('../hooks/useSyncCoordinator', () => ({
    useSyncCoordinator: vi.fn(),
}))

vi.mock('../services/migration', () => ({
    DatabaseMigration: {
        checkMigrationNeeded: vi.fn().mockResolvedValue({ needed: false }),
        performMigration: vi.fn(),
    },
}))

vi.mock('../services/solidPod', () => ({
    POD_CONTAINERS: { ROOT: '/' },
}))

import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { usePodSync } from '../hooks/usePodSync'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)
const mockUsePodSync = vi.mocked(usePodSync)
const mockUseSyncCoordinator = vi.mocked(useSyncCoordinator)

const testQuestionSet = {
    _id: '1',
    _rev: '1',
    questions: [],
    people: [{ id: 'p1', name: 'Me' }],
    alwaysNeededItems: [],
}

describe('EditQuestionsForm', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})

        mockUseSolidPod.mockReturnValue({
            session: null,
            isLoggedIn: false,
            webId: undefined,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
        })

        mockUseDatabase.mockReturnValue({
            db: {
                getQuestionSet: vi.fn().mockResolvedValue(testQuestionSet),
                saveQuestionSet: vi.fn().mockResolvedValue({ rev: '2' }),
            } as unknown as PackingAppDatabase,
        })

        mockUsePodSync.mockReturnValue({
            lastSync: null,
            isSyncing: false,
            error: null,
            saveToPod: vi.fn(),
        })

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

    it('does not show Store in Your Pod sidebar box for non-logged-in users', async () => {
        render(
            <MemoryRouter>
                <EditQuestionsForm />
            </MemoryRouter>
        )

        await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull())
        expect(screen.queryByText(/Store in Your Pod/i)).toBeNull()
    })

    it('shows user-friendly page heading "My Questions & Items"', async () => {
        render(
            <MemoryRouter>
                <EditQuestionsForm />
            </MemoryRouter>
        )

        await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull())
        expect(screen.getByRole('heading', { name: 'My Questions & Items' })).toBeDefined()
        expect(screen.queryByText('Packing List Questions')).toBeNull()
    })

    it('does not show the JSON Editor button', async () => {
        render(
            <MemoryRouter>
                <EditQuestionsForm />
            </MemoryRouter>
        )

        await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull())
        expect(screen.queryByRole('button', { name: /JSON Editor/i })).toBeNull()
        expect(screen.queryByText('(Advanced)')).toBeNull()
    })
})
