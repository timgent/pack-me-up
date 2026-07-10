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

describe('createExampleData - pets', () => {
    const adult: Person = { id: 'a1', name: 'Alice', ageRange: 'Adult' }
    const dog: Person = { id: 'd1', name: 'Rex', species: 'dog' }
    const cat: Person = { id: 'c1', name: 'Whiskers', species: 'cat' }

    const petItem = (result: ReturnType<typeof createExampleData>, text: string) =>
        result.alwaysNeededItems.find(i => i.text === text)

    it('excludes all pet items when no pets are in the group', () => {
        const result = createExampleData([adult])
        for (const text of ['Pet food', 'Lead/Leash', 'Poop bags', 'Litter tray & litter', 'Cat carrier']) {
            expect(petItem(result, text), `"${text}" should not appear`).toBeUndefined()
        }
    })

    it('includes dog-specific items selected for the dog only', () => {
        const result = createExampleData([adult, dog])
        const lead = petItem(result, 'Lead/Leash')
        expect(lead).toBeTruthy()
        expect(lead!.personSelections.find(ps => ps.personId === dog.id)?.selected).toBe(true)
        expect(lead!.personSelections.find(ps => ps.personId === adult.id)?.selected).toBe(false)
    })

    it('includes generic pet items (Pet food) selected for the dog', () => {
        const result = createExampleData([adult, dog])
        const food = petItem(result, 'Pet food')
        expect(food).toBeTruthy()
        expect(food!.personSelections.find(ps => ps.personId === dog.id)?.selected).toBe(true)
    })

    it('does not select the dog for human items (Snacks)', () => {
        const result = createExampleData([adult, dog])
        const snacks = result.alwaysNeededItems.find(i => i.text === 'Snacks')!
        expect(snacks.personSelections.find(ps => ps.personId === dog.id)?.selected).toBe(false)
        expect(snacks.personSelections.find(ps => ps.personId === adult.id)?.selected).toBe(true)
    })

    it('does not select the dog for unfiltered weather items (Sunscreen)', () => {
        const result = createExampleData([adult, dog])
        const weather = result.questions.find(q => q.text === 'What weather do you expect?')!
        const hotItems = weather.options.find(o => o.text === 'Hot')!.items
        const sunscreen = hotItems.find(i => i.text === 'Sunscreen')!
        expect(sunscreen.personSelections.find(ps => ps.personId === dog.id)?.selected).toBe(false)
    })

    it('includes cat-specific items for a cat but no dog items', () => {
        const result = createExampleData([adult, cat])
        const litter = petItem(result, 'Litter tray & litter')
        expect(litter).toBeTruthy()
        expect(litter!.personSelections.find(ps => ps.personId === cat.id)?.selected).toBe(true)
        expect(petItem(result, 'Lead/Leash')).toBeUndefined()
    })

    it('does not select humans for pet items', () => {
        const result = createExampleData([adult, dog])
        const food = petItem(result, 'Pet food')!
        expect(food.personSelections.find(ps => ps.personId === adult.id)?.selected).toBe(false)
    })

    it('produces no item that has all personSelections unselected (with a mixed group)', () => {
        const result = createExampleData([adult, dog, cat])
        const allItems = [
            ...result.alwaysNeededItems,
            ...result.questions.flatMap(q => q.options.flatMap(o => o.items)),
        ]
        for (const item of allItems) {
            expect(item.personSelections.some(ps => ps.selected), `Item "${item.text}" has no one assigned`).toBe(true)
        }
    })
})

describe('createExampleData - travelling abroad', () => {
    const adult: Person = { id: 'a1', name: 'Alice', ageRange: 'Adult' }
    const baby: Person = { id: 'b1', name: 'Baby', ageRange: 'Baby' }
    const dog: Person = { id: 'd1', name: 'Rex', species: 'dog' }

    function getAbroadQuestion(result: ReturnType<typeof createExampleData>) {
        return result.questions.find(q => q.text === 'Are you travelling abroad?')
    }

    function getAbroadYesItems(result: ReturnType<typeof createExampleData>) {
        return getAbroadQuestion(result)!.options.find(o => o.text === 'Yes')!.items
    }

    it('includes a single-choice travelling abroad question with Yes/No options', () => {
        const result = createExampleData([adult])
        const question = getAbroadQuestion(result)
        expect(question).toBeTruthy()
        expect(question!.questionType).toBe('single-choice')
        const optionTexts = question!.options.map(o => o.text)
        expect(optionTexts).toEqual(['Yes', 'No'])
    })

    it('has no items on the No option', () => {
        const result = createExampleData([adult])
        const noOption = getAbroadQuestion(result)!.options.find(o => o.text === 'No')!
        expect(noOption.items).toEqual([])
    })

    it('includes Passport selected for all humans including babies', () => {
        const result = createExampleData([adult, baby, dog])
        const passport = getAbroadYesItems(result).find(i => i.text === 'Passport')
        expect(passport).toBeTruthy()
        expect(passport!.personSelections.find(ps => ps.personId === adult.id)?.selected).toBe(true)
        expect(passport!.personSelections.find(ps => ps.personId === baby.id)?.selected).toBe(true)
        expect(passport!.personSelections.find(ps => ps.personId === dog.id)?.selected).toBe(false)
    })

    it('includes travel document items selected for adults only', () => {
        const result = createExampleData([adult, baby])
        for (const text of ['Travel insurance documents', 'Visa', 'Local currency', 'Copies of important documents']) {
            const found = getAbroadYesItems(result).find(i => i.text === text)
            expect(found, `"${text}" should appear`).toBeTruthy()
            expect(found!.personSelections.find(ps => ps.personId === adult.id)?.selected).toBe(true)
            expect(found!.personSelections.find(ps => ps.personId === baby.id)?.selected).toBe(false)
        }
    })

    it('includes Travel adapter for adults', () => {
        const result = createExampleData([adult])
        const adapter = getAbroadYesItems(result).find(i => i.text === 'Travel adapter')
        expect(adapter).toBeTruthy()
        expect(adapter!.personSelections.find(ps => ps.personId === adult.id)?.selected).toBe(true)
    })

    it('includes pet travel documents only when pets are in the group', () => {
        const withPet = createExampleData([adult, dog])
        const petDocs = getAbroadYesItems(withPet).find(i => i.text === 'Pet passport/Animal health certificate')
        expect(petDocs).toBeTruthy()
        expect(petDocs!.personSelections.find(ps => ps.personId === dog.id)?.selected).toBe(true)
        expect(petDocs!.personSelections.find(ps => ps.personId === adult.id)?.selected).toBe(false)

        const withoutPet = createExampleData([adult])
        expect(getAbroadYesItems(withoutPet).find(i => i.text === 'Pet passport/Animal health certificate')).toBeUndefined()
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

describe('createExampleData communal items', () => {
    const family: Person[] = [
        { id: 'a1', name: 'Alice', ageRange: 'Adult', gender: 'female' },
        { id: 'c1', name: 'Charlie', ageRange: 'Child' },
        { id: 'cat1', name: 'Whiskers', species: 'cat' },
    ]

    function allItems(result: ReturnType<typeof createExampleData>) {
        return [
            ...result.alwaysNeededItems,
            ...result.questions.flatMap(q => q.options.flatMap(o => o.items)),
        ]
    }

    it('marks group kit as communal with existing filters kept as triggers', () => {
        const result = createExampleData(family)
        const items = allItems(result)

        const firstAid = result.alwaysNeededItems.find(i => i.text === 'First aid kit')!
        expect(firstAid.communal).toBe(true)

        const litterTray = result.alwaysNeededItems.find(i => i.text === 'Litter tray & litter')!
        expect(litterTray.communal).toBe(true)
        // Trigger selections preserved: only the cat is selected
        expect(litterTray.personSelections.find(ps => ps.personId === 'cat1')?.selected).toBe(true)
        expect(litterTray.personSelections.find(ps => ps.personId === 'a1')?.selected).toBe(false)

        const travelAdapter = items.find(i => i.text === 'Travel adapter')!
        expect(travelAdapter.communal).toBe(true)
    })

    it('keeps personal items per-person', () => {
        const result = createExampleData(family)
        const items = allItems(result)
        expect(result.alwaysNeededItems.find(i => i.text === 'Snacks')?.communal).toBeUndefined()
        expect(items.find(i => i.text === 'Toothbrush')?.communal).toBeUndefined()
        expect(items.find(i => i.text === 'Passport')?.communal).toBeUndefined()
    })
})
