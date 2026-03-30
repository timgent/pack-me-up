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

describe('useHasQuestions', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns false when no questions exist (not_found)', async () => {
        const db = makeDb({ getQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }) })
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current).toBe(false))
    })

    it('returns false when document exists but has no questions', async () => {
        const db = makeDb({ getQuestionSet: vi.fn().mockResolvedValue({ questions: [] }) })
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current).toBe(false))
    })

    it('returns true when at least one question exists', async () => {
        const db = makeDb({ getQuestionSet: vi.fn().mockResolvedValue({ questions: [{ id: '1', text: 'Do you need a jacket?' }] }) })
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current).toBe(true))
    })

    it('returns false and logs error for unexpected errors', async () => {
        const db = makeDb({ getQuestionSet: vi.fn().mockRejectedValue(new Error('unexpected')) })
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current).toBe(false))
        expect(console.error).toHaveBeenCalled()
    })
})
