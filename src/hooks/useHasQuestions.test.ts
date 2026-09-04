import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { PackingAppDatabase } from '../services/database'
import { useHasQuestions } from './useHasQuestions'

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

import { useDatabase } from '../components/DatabaseContext'

const mockUseDatabase = vi.mocked(useDatabase)

function makeDb(overrides: { getQuestionSet?: ReturnType<typeof vi.fn> } = {}) {
    return {
        getQuestionSet: overrides.getQuestionSet ?? vi.fn().mockResolvedValue({ questions: [] }),
    }
}

function databaseContext(
    db: ReturnType<typeof makeDb>,
    sync: { loginSyncVersion?: number; loginSyncInProgress?: boolean } = {}
) {
    mockUseDatabase.mockReturnValue({
        db: db as unknown as PackingAppDatabase,
        loginSyncVersion: sync.loginSyncVersion ?? 0,
        loginSyncInProgress: sync.loginSyncInProgress ?? false,
    })
}

const aQuestion = { id: '1', text: 'Do you need a jacket?' }

describe('useHasQuestions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns false when no questions exist (not_found)', async () => {
        databaseContext(makeDb({ getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }) }))

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current.hasQuestions).toBe(false))
    })

    it('returns false when document exists but has no questions', async () => {
        databaseContext(makeDb({ getQuestionSet: vi.fn().mockResolvedValue({ questions: [] }) }))

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current.hasQuestions).toBe(false))
    })

    it('returns true when at least one question exists', async () => {
        databaseContext(makeDb({ getQuestionSet: vi.fn().mockResolvedValue({ questions: [aQuestion] }) }))

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current.hasQuestions).toBe(true))
    })

    it('returns false and logs error for unexpected errors', async () => {
        databaseContext(makeDb({ getQuestionSet: vi.fn().mockRejectedValue(new Error('unexpected')) }))

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current.hasQuestions).toBe(false))
        expect(console.error).toHaveBeenCalled()
    })

    // #333: the login sync pulls the pod's question set into the local database
    // in the background, long after this hook first read an empty one.
    it('re-reads when the background login sync completes', async () => {
        const getQuestionSet = vi
            .fn()
            .mockResolvedValueOnce({ questions: [] })
            .mockResolvedValue({ questions: [aQuestion] })
        const db = makeDb({ getQuestionSet })
        databaseContext(db, { loginSyncVersion: 0, loginSyncInProgress: true })

        const { result, rerender } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(getQuestionSet).toHaveBeenCalledTimes(1))
        expect(result.current.hasQuestions).toBe(false)

        databaseContext(db, { loginSyncVersion: 1, loginSyncInProgress: false })
        rerender()

        await waitFor(() => expect(result.current.hasQuestions).toBe(true))
    })

    describe('isLoading', () => {
        it('is true until the first read comes back', async () => {
            let resolveRead: (value: { questions: typeof aQuestion[] }) => void = () => {}
            const getQuestionSet = vi.fn().mockReturnValue(
                new Promise<{ questions: typeof aQuestion[] }>(resolve => { resolveRead = resolve })
            )
            databaseContext(makeDb({ getQuestionSet }))

            const { result } = renderHook(() => useHasQuestions())

            expect(result.current.isLoading).toBe(true)

            resolveRead({ questions: [aQuestion] })

            await waitFor(() => expect(result.current.isLoading).toBe(false))
        })

        // The answer can't be un-found, so a slow pod must not hold the CTA back.
        it('stops loading once questions are found, even while the pod is still being read', async () => {
            databaseContext(
                makeDb({ getQuestionSet: vi.fn().mockResolvedValue({ questions: [aQuestion] }) }),
                { loginSyncInProgress: true }
            )

            const { result } = renderHook(() => useHasQuestions())

            await waitFor(() => expect(result.current.hasQuestions).toBe(true))
            expect(result.current.isLoading).toBe(false)
        })

        // "Nothing here" while the pod is still being read is not an answer yet.
        it('keeps loading when nothing was found and the pod is still being read', async () => {
            const getQuestionSet = vi.fn().mockResolvedValue({ questions: [] })
            databaseContext(makeDb({ getQuestionSet }), { loginSyncInProgress: true })

            const { result } = renderHook(() => useHasQuestions())

            await waitFor(() => expect(getQuestionSet).toHaveBeenCalledTimes(1))
            expect(result.current.isLoading).toBe(true)
        })

        it('is false for a local-only user with no questions and no pod sync', async () => {
            const getQuestionSet = vi.fn().mockRejectedValue({ name: 'not_found' })
            databaseContext(makeDb({ getQuestionSet }), { loginSyncInProgress: false })

            const { result } = renderHook(() => useHasQuestions())

            await waitFor(() => expect(result.current.isLoading).toBe(false))
            expect(result.current.hasQuestions).toBe(false)
        })
    })
})
