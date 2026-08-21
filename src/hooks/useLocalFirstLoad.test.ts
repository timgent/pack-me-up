import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useLocalFirstLoad } from './useLocalFirstLoad'
import { useDatabase } from '../components/DatabaseContext'

vi.mock('../components/DatabaseContext', () => ({ useDatabase: vi.fn() }))

const mockUseDatabase = vi.mocked(useDatabase)

function databaseContext(loginSyncVersion: number, loginSyncInProgress: boolean) {
    mockUseDatabase.mockReturnValue({
        db: {} as never,
        loginSyncVersion,
        loginSyncInProgress,
    })
}

describe('useLocalFirstLoad', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('reads without waiting for the pod sync to finish', async () => {
        databaseContext(0, true)
        const read = vi.fn()

        renderHook(() => useLocalFirstLoad(read, []))

        await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    })

    it('reports that the pod is still being checked', () => {
        databaseContext(0, true)

        const { result } = renderHook(() => useLocalFirstLoad(vi.fn(), []))

        expect(result.current.isCheckingPod).toBe(true)
    })

    it('stops reporting once the pod sync has finished', () => {
        databaseContext(1, false)

        const { result } = renderHook(() => useLocalFirstLoad(vi.fn(), []))

        expect(result.current.isCheckingPod).toBe(false)
    })

    it('does not claim to be checking a pod when there is none', () => {
        databaseContext(0, false)

        const { result } = renderHook(() => useLocalFirstLoad(vi.fn(), []))

        expect(result.current.isCheckingPod).toBe(false)
    })

    // Otherwise a page with nothing to show paints its empty state for a frame
    // between the sync finishing and the read it triggered coming back.
    it('keeps reporting the check until the read the sync triggered comes back', async () => {
        databaseContext(0, true)
        let finishRead: () => void = () => {}
        const read = vi.fn(() => new Promise<void>(resolve => { finishRead = resolve }))

        const { result, rerender } = renderHook(() => useLocalFirstLoad(read, []))
        await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
        act(() => finishRead())

        databaseContext(1, false)
        rerender()

        expect(result.current.isCheckingPod).toBe(true)

        await act(async () => { finishRead() })
        expect(result.current.isCheckingPod).toBe(false)
    })

    it('reads again when the login sync lands, in case the pod brought something new', async () => {
        databaseContext(0, true)
        const read = vi.fn()

        const { rerender } = renderHook(() => useLocalFirstLoad(read, []))
        await waitFor(() => expect(read).toHaveBeenCalledTimes(1))

        databaseContext(1, false)
        rerender()

        await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    })

    it('reads again when the caller\'s own dependencies change', async () => {
        databaseContext(1, false)
        const read = vi.fn()

        const { rerender } = renderHook(({ id }: { id: string }) => useLocalFirstLoad(read, [id]), {
            initialProps: { id: 'list-1' },
        })
        await waitFor(() => expect(read).toHaveBeenCalledTimes(1))

        rerender({ id: 'list-2' })

        await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    })

    it('does not re-read when nothing it depends on has changed', async () => {
        databaseContext(1, false)
        const read = vi.fn()

        const { rerender } = renderHook(() => useLocalFirstLoad(read, ['stable']))
        await waitFor(() => expect(read).toHaveBeenCalledTimes(1))

        rerender()
        rerender()

        expect(read).toHaveBeenCalledTimes(1)
    })

    it('uses the latest read function without re-running for it', async () => {
        databaseContext(1, false)
        const first = vi.fn()
        const second = vi.fn()

        const { rerender } = renderHook(({ read }: { read: () => void }) => useLocalFirstLoad(read, ['stable']), {
            initialProps: { read: first },
        })
        await waitFor(() => expect(first).toHaveBeenCalledTimes(1))

        rerender({ read: second })

        expect(second).not.toHaveBeenCalled()
    })
})
