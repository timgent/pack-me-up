import { describe, it, expect } from 'vitest'
import { createExampleData, ACTIVITY_OPTION_IDS } from './example-data'
import { Person } from './types'

const people: Person[] = [{ id: 'person-1', name: 'Alice', ageRange: 'Adult' }]

describe('ACTIVITY_OPTION_IDS', () => {
    it('exports stable non-UUID string IDs for each activity', () => {
        expect(ACTIVITY_OPTION_IDS.swimming).toBe('activity-option-swimming')
        expect(ACTIVITY_OPTION_IDS.watersports).toBe('activity-option-watersports')
        expect(ACTIVITY_OPTION_IDS.cycling).toBe('activity-option-cycling')
        expect(ACTIVITY_OPTION_IDS.running).toBe('activity-option-running')
        expect(ACTIVITY_OPTION_IDS.climbing).toBe('activity-option-climbing')
        expect(ACTIVITY_OPTION_IDS.hiking).toBe('activity-option-hiking')
        expect(ACTIVITY_OPTION_IDS.formalOccasions).toBe('activity-option-formal-occasions')
    })
})

describe('createExampleData', () => {
    it('uses stable IDs for activity question options', () => {
        const result = createExampleData(people)
        const activitiesQuestion = result.questions.find(q => q.text === 'What activities will you be doing?')!
        const optionIds = activitiesQuestion.options.map(o => o.id)
        expect(optionIds).toContain(ACTIVITY_OPTION_IDS.swimming)
        expect(optionIds).toContain(ACTIVITY_OPTION_IDS.watersports)
        expect(optionIds).toContain(ACTIVITY_OPTION_IDS.cycling)
        expect(optionIds).toContain(ACTIVITY_OPTION_IDS.climbing)
        expect(optionIds).toContain(ACTIVITY_OPTION_IDS.hiking)
    })

    it('returns undefined preSelectedAnswers when no activities provided', () => {
        const result = createExampleData(people)
        expect(result.preSelectedAnswers).toBeUndefined()
    })

    it('returns undefined preSelectedAnswers when empty activities array provided', () => {
        const result = createExampleData(people, [])
        expect(result.preSelectedAnswers).toBeUndefined()
    })

    it('returns preSelectedAnswers with correct questionId and option IDs', () => {
        const result = createExampleData(people, [
            ACTIVITY_OPTION_IDS.swimming,
            ACTIVITY_OPTION_IDS.cycling,
        ])
        const activitiesQuestion = result.questions.find(q => q.text === 'What activities will you be doing?')!

        expect(result.preSelectedAnswers).toHaveLength(1)
        expect(result.preSelectedAnswers![0].questionId).toBe(activitiesQuestion.id)
        expect(result.preSelectedAnswers![0].selectedOptionIds).toEqual(
            expect.arrayContaining([ACTIVITY_OPTION_IDS.swimming, ACTIVITY_OPTION_IDS.cycling])
        )
        expect(result.preSelectedAnswers![0].selectedOptionIds).toHaveLength(2)
    })

    it('ignores unknown activity IDs', () => {
        const result = createExampleData(people, ['not-a-real-id', ACTIVITY_OPTION_IDS.hiking])
        expect(result.preSelectedAnswers).toHaveLength(1)
        expect(result.preSelectedAnswers![0].selectedOptionIds).toEqual([ACTIVITY_OPTION_IDS.hiking])
    })

    it('returns undefined preSelectedAnswers when only unknown IDs provided', () => {
        const result = createExampleData(people, ['not-a-real-id'])
        expect(result.preSelectedAnswers).toBeUndefined()
    })
})
