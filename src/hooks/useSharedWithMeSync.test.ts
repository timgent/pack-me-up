import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSharedWithMeSync } from './useSharedWithMeSync'
import type { SharedWithMeList } from '../services/rdfSerialization'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSharedWithMe = vi.fn()
const mockSaveSharedWithMe = vi.fn()

const mockDb = {
    getSharedWithMe: mockGetSharedWithMe,
    saveSharedWithMe: mockSaveSharedWithMe,
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
    POD_CONTAINERS: { SHARED_WITH_ME: 'pack-me-up/shared-with-me.ttl' },
}))

vi.mock('../services/rdfSerialization', () => ({
    sharedWithMeToDataset: vi.fn(),
    datasetToSharedWithMe: vi.fn(),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

const emptyData: SharedWithMeList = { contexts: [], lastModified: '2024-01-01T00:00:00.000Z' }

describe('useSharedWithMeSync', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetSharedWithMe.mockResolvedValue(emptyData)
        mockSaveSharedWithMe.mockResolvedValue({ rev: '2-abc' })
    })

    it('auto-loads sharedWithMe from DB on mount', async () => {
        const { result } = renderHook(() => useSharedWithMeSync())
        await waitFor(() => expect(result.current.sharedWithMe).not.toBeNull())
        expect(result.current.sharedWithMe).toEqual(emptyData)
        expect(mockGetSharedWithMe).toHaveBeenCalledTimes(1)
    })

    it('returns empty list when DB throws not_found', async () => {
        mockGetSharedWithMe.mockRejectedValue(new Error('not_found'))
        const { result } = renderHook(() => useSharedWithMeSync())
        await waitFor(() => expect(result.current.sharedWithMe).not.toBeNull())
        expect(result.current.sharedWithMe?.contexts).toEqual([])
    })

    it('saveSharedWithMe saves through useSyncCoordinator (not db directly)', async () => {
        const { result } = renderHook(() => useSharedWithMeSync())
        await waitFor(() => expect(result.current.sharedWithMe).not.toBeNull())

        const updated: SharedWithMeList = {
            contexts: [{ podUrl: 'https://pod/', webId: 'https://pod/profile/card#me', addedAt: '2024-01-01T00:00:00.000Z' }],
            lastModified: '2024-01-02T00:00:00.000Z',
        }

        await act(async () => {
            await result.current.saveSharedWithMe(updated)
        })

        expect(mockSaveSharedWithMe).toHaveBeenCalledWith(expect.objectContaining({ contexts: updated.contexts }))
    })

    it('saveSharedWithMe updates local state after save', async () => {
        const { result } = renderHook(() => useSharedWithMeSync())
        await waitFor(() => expect(result.current.sharedWithMe).not.toBeNull())

        const updated: SharedWithMeList = {
            contexts: [{ podUrl: 'https://friend.pod/', webId: 'https://friend.pod/profile/card#me', addedAt: '2024-01-01T00:00:00.000Z' }],
            lastModified: '2024-01-02T00:00:00.000Z',
        }

        await act(async () => {
            await result.current.saveSharedWithMe(updated)
        })

        expect(result.current.sharedWithMe?.contexts[0].podUrl).toBe('https://friend.pod/')
    })
})
