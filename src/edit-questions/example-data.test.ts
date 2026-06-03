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

describe('createExampleData - unassigned items excluded', () => {
    const adult: Person = { id: 'a1', name: 'Alice', ageRange: 'Adult' }
    const baby: Person = { id: 'b1', name: 'Baby', ageRange: 'Baby' }
    const toddler: Person = { id: 't1', name: 'Toddler', ageRange: 'Toddler' }

    it('excludes baby items from alwaysNeededItems when no babies in group', () => {
        const result = createExampleData([adult])
        const babyItemTexts = ['Nappies (pack/supply)', 'Baby wipes', 'Nappy bags', 'Change mat', 'Bibs', 'Muslins/Burp cloths']
        for (const text of babyItemTexts) {
            expect(result.alwaysNeededItems.find(i => i.text === text), `"${text}" should not appear`).toBeUndefined()
        }
    })

    it('excludes toddler items from alwaysNeededItems when no toddlers in group', () => {
        const result = createExampleData([adult])
        const toddlerItemTexts = ['Pull-ups/Toddler nappies', 'Potty (travel potty)', 'Sippy cup/Toddler cup', 'Toddler snacks', 'Comfort item (teddy/blanket)']
        for (const text of toddlerItemTexts) {
            expect(result.alwaysNeededItems.find(i => i.text === text), `"${text}" should not appear`).toBeUndefined()
        }
    })

    it('includes baby items in alwaysNeededItems when babies are in the group', () => {
        const result = createExampleData([adult, baby])
        expect(result.alwaysNeededItems.find(i => i.text === 'Nappies (pack/supply)')).toBeTruthy()
    })

    it('excludes baby swimming items when no babies in group', () => {
        const result = createExampleData([adult])
        const activities = result.questions.find(q => q.text === 'What activities will you be doing?')!
        const swimmingItems = activities.options.find(o => o.id === ACTIVITY_OPTION_IDS.swimming)!.items
        expect(swimmingItems.find(i => i.text === 'Baby swim nappy')).toBeUndefined()
        expect(swimmingItems.find(i => i.text === 'Baby float/Swim seat')).toBeUndefined()
    })

    it('includes toddler items in alwaysNeededItems when toddlers are in the group', () => {
        const result = createExampleData([adult, toddler])
        expect(result.alwaysNeededItems.find(i => i.text === 'Sippy cup/Toddler cup')).toBeTruthy()
    })

    it('no item in the question set has all personSelections unselected', () => {
        const result = createExampleData([adult])
        const allItems = [
            ...result.alwaysNeededItems,
            ...result.questions.flatMap(q => q.options.flatMap(o => o.items)),
        ]
        for (const item of allItems) {
            const anySelected = item.personSelections.some(ps => ps.selected)
            expect(anySelected, `Item "${item.text}" has no one assigned`).toBe(true)
        }
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

    it('does not include Menstrual products for male-only group', () => {
        const result = createExampleData([maleAdult])
        const items = getOvernightYesItems(result)
        expect(items.find(i => i.text === 'Menstrual products')).toBeUndefined()
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

    it('does not include Shaving kit for female-only group', () => {
        const result = createExampleData([femaleAdult])
        const items = getOvernightYesItems(result)
        expect(items.find(i => i.text === 'Shaving kit')).toBeUndefined()
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
