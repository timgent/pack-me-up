import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { CreatePackingList } from './create-packing-list'
import { ACTIVITY_OPTION_IDS } from '../edit-questions/example-data'
import { PackingListQuestionSet } from '../edit-questions/types'

// --- Mocks ---

vi.mock('../components/DatabaseContext', () => ({
    useDatabase: vi.fn(),
}))

vi.mock('../components/ToastContext', () => ({
    useToast: vi.fn(),
}))

vi.mock('../components/SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

import { useDatabase } from '../components/DatabaseContext'
import { useToast } from '../components/ToastContext'
import { useSolidPod } from '../components/SolidPodContext'

const mockUseDatabase = vi.mocked(useDatabase)
const mockUseToast = vi.mocked(useToast)
const mockUseSolidPod = vi.mocked(useSolidPod)

function makeQuestionSet(overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet {
    const activitiesQuestionId = 'q-activities'
    return {
        _id: '1',
        people: [{ id: 'p1', name: 'Alice', ageRange: 'Adult' }],
        alwaysNeededItems: [],
        questions: [
            {
                id: activitiesQuestionId,
                type: 'saved',
                text: 'What activities will you be doing?',
                order: 0,
                questionType: 'multiple-choice',
                options: [
                    { id: ACTIVITY_OPTION_IDS.cycling, text: 'Cycling', order: 0, items: [] },
                    { id: ACTIVITY_OPTION_IDS.climbing, text: 'Climbing', order: 1, items: [] },
                    { id: ACTIVITY_OPTION_IDS.swimming, text: 'Swimming', order: 2, items: [] },
                ],
            },
        ],
        ...overrides,
    }
}

function renderCreatePackingList(questionSet: PackingListQuestionSet) {
    const mockDb = {
        getQuestionSet: vi.fn().mockResolvedValue(questionSet),
        savePackingList: vi.fn(),
    }
    mockUseDatabase.mockReturnValue({ db: mockDb } as any)
    mockUseToast.mockReturnValue({ showToast: vi.fn() } as any)
    mockUseSolidPod.mockReturnValue({ isLoggedIn: false } as any)

    return render(
        <MemoryRouter>
            <CreatePackingList />
        </MemoryRouter>
    )
}

describe('CreatePackingList pre-population from preSelectedAnswers', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('pre-checks activity options from preSelectedAnswers', async () => {
        const questionSet = makeQuestionSet({
            preSelectedAnswers: [{
                questionId: 'q-activities',
                selectedOptionIds: [ACTIVITY_OPTION_IDS.cycling, ACTIVITY_OPTION_IDS.climbing],
            }],
        })

        renderCreatePackingList(questionSet)

        const cyclingCheckbox = await screen.findByRole('checkbox', { name: /Cycling/i })
        const climbingCheckbox = screen.getByRole('checkbox', { name: /Climbing/i })
        const swimmingCheckbox = screen.getByRole('checkbox', { name: /Swimming/i })

        expect(cyclingCheckbox).toBeChecked()
        expect(climbingCheckbox).toBeChecked()
        expect(swimmingCheckbox).not.toBeChecked()
    })

    it('leaves all activity checkboxes unchecked when no preSelectedAnswers', async () => {
        const questionSet = makeQuestionSet()

        renderCreatePackingList(questionSet)

        const cyclingCheckbox = await screen.findByRole('checkbox', { name: /Cycling/i })
        const climbingCheckbox = screen.getByRole('checkbox', { name: /Climbing/i })

        expect(cyclingCheckbox).not.toBeChecked()
        expect(climbingCheckbox).not.toBeChecked()
    })
})
