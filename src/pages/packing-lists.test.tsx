import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { PackingLists } from './packing-lists'
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

vi.mock('../hooks/usePodErrorHandler', () => ({
    usePodErrorHandler: vi.fn(() => vi.fn()),
}))

vi.mock('../services/solidPod', () => ({
    getPrimaryPodUrl: vi.fn(),
    saveMultipleFilesToPod: vi.fn(),
    loadMultipleFilesFromPod: vi.fn(),
    POD_CONTAINERS: { PACKING_LISTS: '/packing-lists/' },
    POD_ERROR_MESSAGES: {
        NOT_LOGGED_IN: 'Not logged in',
        NOT_LOGGED_IN_LOAD: 'Not logged in to load',
        SAVE_FAILED: 'Save failed',
        LOAD_FAILED: 'Load failed',
        NO_DATA_FOUND: (t: string) => `No ${t} found`,
    },
}))

import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseSolidPod = vi.mocked(useSolidPod)

const testPackingList = {
    id: 'list-1',
    name: 'Beach Trip',
    createdAt: '2026-01-01T00:00:00Z',
    items: [{ id: 'i1', itemText: 'Sunscreen', personName: 'Me', personId: 'p1', questionId: 'q1', optionId: 'o1', packed: false }],
}

describe('PackingLists', () => {
    beforeEach(() => {
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
                getAllPackingLists: vi.fn().mockResolvedValue([testPackingList]),
                deletePackingList: vi.fn(),
                savePackingList: vi.fn(),
            } as unknown as PackingAppDatabase,
        })
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not show Protect Your Packing Lists banner for non-logged-in users with lists', async () => {
        render(
            <MemoryRouter>
                <PackingLists />
            </MemoryRouter>
        )

        await waitFor(() => expect(screen.getByText(/Beach Trip/)).toBeTruthy())
        expect(screen.queryByText(/Protect Your Packing Lists/i)).toBeNull()
    })
})
