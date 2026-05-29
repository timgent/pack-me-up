import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSharedListsSync } from './useSharedListsSync'
import type { SharedListsWithMe } from '../services/rdfSerialization'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSharedListsWithMe = vi.fn()
const mockSaveSharedListsWithMe = vi.fn()

const mockDb = {
    getSharedListsWithMe: mockGetSharedListsWithMe,
    saveSharedListsWithMe: mockSaveSharedListsWithMe,
}

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: () => ({ db: mockDb }),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: () => ({ isLoggedIn: true, session: { fetch: globalThis.fetch, info: { isLoggedIn: true } } }),
}))

vi.mock('./usePodSync', () => ({
    usePodSync: () => ({ saveToPod: vi.fn().mockResolvedValue(true), syncFromPod: vi.fn(), lastSync: null, isSyncing: false, error: null }),
}))

vi.mock('../services/solidPod', () => ({
    POD_CONTAINERS: { SHARED_LISTS_WITH_ME: 'pack-me-up/shared-lists-with-me.ttl' },
}))

vi.mock('../services/rdfSerialization', () => ({
    sharedListsWithMeToDataset: vi.fn(),
    datasetToSharedListsWithMe: vi.fn(),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

const emptyData: SharedListsWithMe = { lists: [], lastModified: '2024-01-01T00:00:00.000Z' }

describe('useSharedListsSync', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetSharedListsWithMe.mockResolvedValue(emptyData)
        mockSaveSharedListsWithMe.mockResolvedValue({ rev: '2-abc' })
    })

    it('auto-loads sharedListsWithMe from DB on mount', async () => {
        const { result } = renderHook(() => useSharedListsSync())
        await waitFor(() => expect(result.current.sharedListsWithMe).not.toBeNull())
        expect(result.current.sharedListsWithMe).toEqual(emptyData)
        expect(mockGetSharedListsWithMe).toHaveBeenCalledTimes(1)
    })

    it('returns empty list when DB throws not_found', async () => {
        mockGetSharedListsWithMe.mockRejectedValue(new Error('not_found'))
        const { result } = renderHook(() => useSharedListsSync())
        await waitFor(() => expect(result.current.sharedListsWithMe).not.toBeNull())
        expect(result.current.sharedListsWithMe?.lists).toEqual([])
    })

    it('saveSharedListsWithMe saves through useSyncCoordinator (not db directly)', async () => {
        const { result } = renderHook(() => useSharedListsSync())
        await waitFor(() => expect(result.current.sharedListsWithMe).not.toBeNull())

        const updated: SharedListsWithMe = {
            lists: [{ listId: 'abc', listUrl: 'https://pod/list.ttl', podUrl: 'https://pod/', addedAt: '2024-01-01T00:00:00.000Z' }],
            lastModified: '2024-01-02T00:00:00.000Z',
        }

        await act(async () => {
            await result.current.saveSharedListsWithMe(updated)
        })

        // db.saveSharedListsWithMe called through useSyncCoordinator
        expect(mockSaveSharedListsWithMe).toHaveBeenCalledWith(expect.objectContaining({ lists: updated.lists }))
    })

    it('saveSharedListsWithMe updates local state after save', async () => {
        const { result } = renderHook(() => useSharedListsSync())
        await waitFor(() => expect(result.current.sharedListsWithMe).not.toBeNull())

        const updated: SharedListsWithMe = {
            lists: [{ listId: 'xyz', listUrl: 'https://pod/x.ttl', podUrl: 'https://pod/', addedAt: '2024-01-01T00:00:00.000Z' }],
            lastModified: '2024-01-02T00:00:00.000Z',
        }

        await act(async () => {
            await result.current.saveSharedListsWithMe(updated)
        })

        expect(result.current.sharedListsWithMe?.lists[0].listId).toBe('xyz')
    })
})
