import { describe, it, expect } from 'vitest'
import { createExampleData, ACTIVITY_OPTION_IDS } from './example-data'
import { Person } from './types'

const people: Person[] = [{ id: 'person-1', name: 'Alice', ageRange: 'Adult' }]
const femaleAdult: Person = { id: 'f1', name: 'Alice', ageRange: 'Adult', gender: 'female' }
const maleAdult: Person = { id: 'm1', name: 'Bob', ageRange: 'Adult', gender: 'male' }

const ALL_ACTIVITY_OPTION_IDS = Object.values(ACTIVITY_OPTION_IDS)

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

    it('includes all activity options when no activities provided', () => {
        const result = createExampleData(people)
        const activitiesQuestion = result.questions.find(q => q.text === 'What activities will you be doing?')!
        const optionIds = activitiesQuestion.options.map(o => o.id)
        expect(optionIds).toEqual(expect.arrayContaining(ALL_ACTIVITY_OPTION_IDS))
        expect(optionIds).toHaveLength(ALL_ACTIVITY_OPTION_IDS.length)
    })

    it('includes all activity options when empty array provided', () => {
        const result = createExampleData(people, [])
        const activitiesQuestion = result.questions.find(q => q.text === 'What activities will you be doing?')!
        const optionIds = activitiesQuestion.options.map(o => o.id)
        expect(optionIds).toHaveLength(ALL_ACTIVITY_OPTION_IDS.length)
    })

    it('filters activity options to only selected activities', () => {
        const result = createExampleData(people, [
            ACTIVITY_OPTION_IDS.cycling,
            ACTIVITY_OPTION_IDS.climbing,
        ])
        const activitiesQuestion = result.questions.find(q => q.text === 'What activities will you be doing?')!
        const optionIds = activitiesQuestion.options.map(o => o.id)
        expect(optionIds).toEqual(expect.arrayContaining([ACTIVITY_OPTION_IDS.cycling, ACTIVITY_OPTION_IDS.climbing]))
        expect(optionIds).toHaveLength(2)
    })

    it('ignores unknown activity IDs', () => {
        const result = createExampleData(people, ['not-a-real-id', ACTIVITY_OPTION_IDS.hiking])
        const activitiesQuestion = result.questions.find(q => q.text === 'What activities will you be doing?')!
        const optionIds = activitiesQuestion.options.map(o => o.id)
        expect(optionIds).toEqual([ACTIVITY_OPTION_IDS.hiking])
        expect(optionIds).toHaveLength(1)
    })

    it('includes all activity options when only unknown IDs provided', () => {
        const result = createExampleData(people, ['not-a-real-id'])
        const activitiesQuestion = result.questions.find(q => q.text === 'What activities will you be doing?')!
        expect(activitiesQuestion.options).toHaveLength(ALL_ACTIVITY_OPTION_IDS.length)
    })
})

describe('createExampleData - gender-specific items', () => {
    function getOvernightYesItems(result: ReturnType<typeof createExampleData>) {
        const overnight = result.questions.find(q => q.text === 'Will you be staying overnight?')!
        return overnight.options.find(o => o.text === 'Yes')!.items
    }

    function getSwimmingItems(result: ReturnType<typeof createExampleData>) {
        const activities = result.questions.find(q => q.text === 'What activities will you be doing?')!
        return activities.options.find(o => o.id === ACTIVITY_OPTION_IDS.swimming)!.items
    }

    it('includes Menstrual products selected for female adult', () => {
        const result = createExampleData([femaleAdult, maleAdult])
        const items = getOvernightYesItems(result)
        const item = items.find(i => i.text === 'Menstrual products')
        expect(item).toBeTruthy()
        expect(item!.personSelections.find(ps => ps.personId === femaleAdult.id)?.selected).toBe(true)
        expect(item!.personSelections.find(ps => ps.personId === maleAdult.id)?.selected).toBe(false)
    })

    it('does not select Menstrual products for male adult', () => {
        const result = createExampleData([maleAdult])
        const items = getOvernightYesItems(result)
        const item = items.find(i => i.text === 'Menstrual products')
        expect(item).toBeTruthy()
        expect(item!.personSelections.find(ps => ps.personId === maleAdult.id)?.selected).toBe(false)
    })

    it('includes Sports bra selected for female adult runner', () => {
        const result = createExampleData([femaleAdult, maleAdult])
        const activities = result.questions.find(q => q.text === 'What activities will you be doing?')!
        const runningItems = activities.options.find(o => o.id === ACTIVITY_OPTION_IDS.running)!.items
        const item = runningItems.find(i => i.text === 'Sports bra')
        expect(item).toBeTruthy()
        expect(item!.personSelections.find(ps => ps.personId === femaleAdult.id)?.selected).toBe(true)
        expect(item!.personSelections.find(ps => ps.personId === maleAdult.id)?.selected).toBe(false)
    })

    it('does not include Sports bra in swimming (swimsuit covers that)', () => {
        const result = createExampleData([femaleAdult, maleAdult])
        const items = getSwimmingItems(result)
        expect(items.find(i => i.text === 'Sports bra')).toBeUndefined()
    })

    it('includes Sports bra for female adults in cycling, hiking, and climbing', () => {
        const result = createExampleData([femaleAdult, maleAdult])
        const activities = result.questions.find(q => q.text === 'What activities will you be doing?')!
        for (const actId of [ACTIVITY_OPTION_IDS.cycling, ACTIVITY_OPTION_IDS.hiking, ACTIVITY_OPTION_IDS.climbing]) {
            const items = activities.options.find(o => o.id === actId)!.items
            const bra = items.find(i => i.text === 'Sports bra')
            expect(bra, `Sports bra missing from ${actId}`).toBeTruthy()
            expect(bra!.personSelections.find(ps => ps.personId === femaleAdult.id)?.selected).toBe(true)
            expect(bra!.personSelections.find(ps => ps.personId === maleAdult.id)?.selected).toBe(false)
        }
    })

    it('includes Bra selected for female adult in overnight packing', () => {
        const result = createExampleData([femaleAdult, maleAdult])
        const items = getOvernightYesItems(result)
        const item = items.find(i => i.text === 'Bra')
        expect(item).toBeTruthy()
        expect(item!.personSelections.find(ps => ps.personId === femaleAdult.id)?.selected).toBe(true)
        expect(item!.personSelections.find(ps => ps.personId === maleAdult.id)?.selected).toBe(false)
    })

    it('includes Shaving kit selected for male adult', () => {
        const result = createExampleData([femaleAdult, maleAdult])
        const items = getOvernightYesItems(result)
        const item = items.find(i => i.text === 'Shaving kit')
        expect(item).toBeTruthy()
        expect(item!.personSelections.find(ps => ps.personId === maleAdult.id)?.selected).toBe(true)
        expect(item!.personSelections.find(ps => ps.personId === femaleAdult.id)?.selected).toBe(false)
    })
})
