import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHasQuestions } from './useHasQuestions'

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

import { useDatabase } from '../components/DatabaseContext'

const mockUseDatabase = vi.mocked(useDatabase)

function makeContextValue(overrides: { loadQuestionSet?: ReturnType<typeof vi.fn> } = {}) {
    return {
        loadQuestionSet: overrides.loadQuestionSet ?? vi.fn().mockResolvedValue({ questions: [] }),
    } as ReturnType<typeof useDatabase>
}

describe('useHasQuestions', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns false when no questions exist (not_found)', async () => {
        mockUseDatabase.mockReturnValue(makeContextValue({ loadQuestionSet: vi.fn().mockRejectedValue({ name: 'not_found' }) }))

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current).toBe(false))
    })

    it('returns false when document exists but has no questions', async () => {
        mockUseDatabase.mockReturnValue(makeContextValue({ loadQuestionSet: vi.fn().mockResolvedValue({ questions: [] }) }))

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current).toBe(false))
    })

    it('returns true when at least one question exists', async () => {
        mockUseDatabase.mockReturnValue(makeContextValue({ loadQuestionSet: vi.fn().mockResolvedValue({ questions: [{ id: '1', text: 'Do you need a jacket?' }] }) }))

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current).toBe(true))
    })

    it('returns false and logs error for unexpected errors', async () => {
        mockUseDatabase.mockReturnValue(makeContextValue({ loadQuestionSet: vi.fn().mockRejectedValue(new Error('unexpected')) }))

        const { result } = renderHook(() => useHasQuestions())

        await waitFor(() => expect(result.current).toBe(false))
        expect(console.error).toHaveBeenCalled()
    })
})
