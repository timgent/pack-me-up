import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWizardGeneration } from './useWizardGeneration'

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(() => ({ showToast: vi.fn() })),
}))

const mockSaveToPod = vi.fn().mockResolvedValue(true)
vi.mock('../hooks/usePodSync', () => ({
    usePodSync: vi.fn(() => ({ saveToPod: mockSaveToPod })),
}))

import { useDatabase } from '../components/DatabaseContext'
import type { PackingAppDatabase } from '../services/database'

const mockUseDatabase = vi.mocked(useDatabase)

function makeDb() {
    return {
        saveQuestionSet: vi.fn().mockResolvedValue({ rev: 'rev-1' }),
    }
}

describe('useWizardGeneration', () => {
    beforeEach(() => {
        const db = makeDb()
        mockUseDatabase.mockReturnValue({ db: db as unknown as PackingAppDatabase })
        mockSaveToPod.mockClear()
    })

    it('passes gender from form data through to the saved question set people', async () => {
        const saveQuestionSet = vi.fn().mockResolvedValue({ rev: 'rev-1' })
        mockUseDatabase.mockReturnValue({
            db: { saveQuestionSet } as unknown as PackingAppDatabase,
        })

        const { result } = renderHook(() => useWizardGeneration())

        await act(async () => {
            await result.current.generateAndSave({
                people: [
                    { name: 'Alice', ageRange: 'Adult', gender: 'female' },
                    { name: 'Bob', ageRange: 'Adult', gender: 'male' },
                ],
            })
        })

        expect(saveQuestionSet).toHaveBeenCalledOnce()
        const savedData = saveQuestionSet.mock.calls[0][0]
        expect(savedData.people[0].name).toBe('Alice')
        expect(savedData.people[0].gender).toBe('female')
        expect(savedData.people[1].name).toBe('Bob')
        expect(savedData.people[1].gender).toBe('male')
    })

    it('omits gender from people when not provided in form data', async () => {
        const saveQuestionSet = vi.fn().mockResolvedValue({ rev: 'rev-1' })
        mockUseDatabase.mockReturnValue({ db: { saveQuestionSet } as unknown as PackingAppDatabase })

        const { result } = renderHook(() => useWizardGeneration())

        await act(async () => {
            await result.current.generateAndSave({
                people: [{ name: 'Dana', ageRange: 'Adult' }],
            })
        })

        const savedData = saveQuestionSet.mock.calls[0][0]
        expect(savedData.people[0].gender).toBeUndefined()
    })

    it('syncs the question set to the pod after saving locally', async () => {
        const saveQuestionSet = vi.fn().mockResolvedValue({ rev: 'rev-1' })
        mockUseDatabase.mockReturnValue({
            db: { saveQuestionSet } as unknown as PackingAppDatabase,
        })

        const { result } = renderHook(() => useWizardGeneration())

        await act(async () => {
            await result.current.generateAndSave({
                people: [{ name: 'Alice', ageRange: 'Adult' }],
            })
        })

        expect(mockSaveToPod).toHaveBeenCalledOnce()
        const podData = mockSaveToPod.mock.calls[0][0]
        expect(podData.people[0].name).toBe('Alice')
        expect(podData._rev).toBe('rev-1')
    })
})
