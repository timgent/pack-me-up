import { describe, it, expect } from 'vitest'
import { createExampleData, ACTIVITY_OPTION_IDS, TEMPLATE_QUESTION_IDS, TRANSPORT_OPTION_IDS, ACCOMMODATION_OPTION_IDS, WIZARD_TEMPLATE_VERSION } from './example-data'
import { CATEGORIES } from './item-sections'
import { Item, Person } from './types'
import { generateQuestionBasedItems } from '../create-packing-list/generatePackingListItems'
import { deduplicateItems } from '../create-packing-list/deduplicate'

const people: Person[] = [{ id: 'person-1', name: 'Alice', ageRange: 'Adult' }]
const femaleAdult: Person = { id: 'f1', name: 'Alice', ageRange: 'Adult', gender: 'female' }
const maleAdult: Person = { id: 'm1', name: 'Bob', ageRange: 'Adult', gender: 'male' }

const ALL_ACTIVITY_OPTION_IDS = Object.values(ACTIVITY_OPTION_IDS)

describe('ACTIVITY_OPTION_IDS', () => {
    it('exports stable non-UUID string IDs for each activity', () => {
        expect(ACTIVITY_OPTION_IDS.swimming).toBe('activity-option-swimming')
        expect(ACTIVITY_OPTION_IDS.beach).toBe('activity-option-beach')
        expect(ACTIVITY_OPTION_IDS.watersports).toBe('activity-option-watersports')
        expect(ACTIVITY_OPTION_IDS.cycling).toBe('activity-option-cycling')
        expect(ACTIVITY_OPTION_IDS.running).toBe('activity-option-running')
        expect(ACTIVITY_OPTION_IDS.climbing).toBe('activity-option-climbing')
        expect(ACTIVITY_OPTION_IDS.hiking).toBe('activity-option-hiking')
        expect(ACTIVITY_OPTION_IDS.sightseeing).toBe('activity-option-sightseeing')
        expect(ACTIVITY_OPTION_IDS.skiing).toBe('activity-option-skiing')
        expect(ACTIVITY_OPTION_IDS.themePark).toBe('activity-option-theme-park')
        expect(ACTIVITY_OPTION_IDS.formalOccasions).toBe('activity-option-formal-occasions')
        expect(ACTIVITY_OPTION_IDS.festival).toBe('activity-option-festival')
    })
})

describe('createExampleData - the day bag', () => {
    const family: Person[] = [
        { id: 'a1', name: 'Alice', ageRange: 'Adult', gender: 'female' },
        { id: 'c1', name: 'Cal', ageRange: 'Child' },
        { id: 'b1', name: 'Bea', ageRange: 'Baby' },
    ]

    function everyItem(result: ReturnType<typeof createExampleData>) {
        return [
            ...result.alwaysNeededItems,
            ...result.questions.flatMap(q => q.options.flatMap(o => o.items)),
        ]
    }

    const categoryOf = (result: ReturnType<typeof createExampleData>, text: string) =>
        everyItem(result).find(i => i.text === text)?.category

    // The whole point of the section: these used to be spread over Tech,
    // Toiletries, Food and Toys, so assembling the day bag meant reading the
    // entire list and remembering which rows counted.
    it('gathers what has to stay with you into one section', () => {
        const result = createExampleData(family)
        for (const text of [
            'Wallet and bank cards',
            'House keys',
            'Phone',
            'Phone charger',
            'Power bank',
            'Headphones',
            'Hand sanitiser',
            'Tissues',
            'Snacks',
            'Water bottle',
            'Day bag / Backpack',
            'Colouring book and pens',
            'Playing cards/Travel games',
            'Ear defenders',
        ]) {
            expect(categoryOf(result, text), `"${text}" should be in the day bag`)
                .toBe(CATEGORIES.dayBag)
        }
    })

    it('files the journey items from each transport option into the day bag', () => {
        const result = createExampleData(family)
        for (const text of [
            'Boarding passes',
            'Tickets',
            'Medication in hand luggage',
            'Hand luggage liquids bag',
            'Downloaded films and music',
            'Snacks for the journey',
            'Travel sickness tablets',
            'Car keys',
            'Car charger',
            'Milk or dummy for take-off and landing',
        ]) {
            expect(categoryOf(result, text), `"${text}" should be in the day bag`)
                .toBe(CATEGORIES.dayBag)
        }
    })

    // Bulk supplies are packed once and not opened again until you arrive, so
    // they stay in the sections that map onto a room at home.
    it('leaves the bulk of the packing in its functional section', () => {
        const result = createExampleData(family)
        expect(categoryOf(result, 'Underwear')).toBe(CATEGORIES.clothes)
        expect(categoryOf(result, 'Toothbrush')).toBe(CATEGORIES.toiletries)
        expect(categoryOf(result, 'Nappies (pack/supply)')).toBe(CATEGORIES.nappies)
        expect(categoryOf(result, 'Passport')).toBe(CATEGORIES.documents)
        expect(categoryOf(result, 'First aid kit')).toBe(CATEGORIES.medical)
        expect(categoryOf(result, 'Tent')).toBe(CATEGORIES.kit)
    })

    it('files every template item into one of the template sections', () => {
        const known = new Set<string>(Object.values(CATEGORIES))
        for (const item of everyItem(createExampleData(family))) {
            expect(known, `"${item.text}" is in "${item.category}"`).toContain(item.category)
        }
    })
})

describe('createExampleData - festivals', () => {
    const family: Person[] = [
        { id: 'a1', name: 'Alice', ageRange: 'Adult', gender: 'female' },
        { id: 'c1', name: 'Cal', ageRange: 'Child' },
    ]

    const festivalItems = (result: ReturnType<typeof createExampleData>) =>
        result.questions
            .find(q => q.id === TEMPLATE_QUESTION_IDS.activities)!
            .options.find(o => o.id === ACTIVITY_OPTION_IDS.festival)!.items

    it('offers a festival as an activity, so it can be combined with camping', () => {
        const result = createExampleData(family)
        const activities = result.questions.find(q => q.id === TEMPLATE_QUESTION_IDS.activities)!
        const festival = activities.options.find(o => o.id === ACTIVITY_OPTION_IDS.festival)
        expect(festival).toBeTruthy()
        expect(festival!.text).toBe('Festival or live music')
    })

    it('packs the things a festival needs and nothing else does', () => {
        const texts = festivalItems(createExampleData(family)).map(i => i.text)
        expect(texts).toEqual(expect.arrayContaining([
            'Festival tickets or wristband',
            'Bum bag or small crossbody bag',
            'Cash in small notes',
            'Ear plugs',
            'Tent flag or marker',
            'Dry shampoo',
            'Toilet roll',
        ]))
    })

    // Wellies, a head torch and camp chairs are already in the camping option;
    // repeating them here is what makes the list right for someone at a
    // festival who booked a hotel, and `deduplicateItems` collapses the pair
    // for everyone else.
    it('repeats the outdoor kit that a festival needs whether or not you camp', () => {
        const texts = festivalItems(createExampleData(family)).map(i => i.text)
        expect(texts).toEqual(expect.arrayContaining(['Wellies', 'Head torch', 'Camp chairs']))
    })

    it('gives children ear defenders and adults ear plugs', () => {
        const items = festivalItems(createExampleData(family))
        const defenders = items.find(i => i.text === 'Ear defenders')!
        expect(defenders.personSelections.find(ps => ps.personId === 'c1')?.selected).toBe(true)
        expect(defenders.personSelections.find(ps => ps.personId === 'a1')?.selected).toBe(false)

        const plugs = items.find(i => i.text === 'Ear plugs')!
        expect(plugs.personSelections.find(ps => ps.personId === 'a1')?.selected).toBe(true)
    })

    it('puts the wristband and the cash where you can reach them', () => {
        const items = festivalItems(createExampleData(family))
        expect(items.find(i => i.text === 'Festival tickets or wristband')!.category)
            .toBe(CATEGORIES.dayBag)
        expect(items.find(i => i.text === 'Cash in small notes')!.category)
            .toBe(CATEGORIES.dayBag)
    })
})

describe('TEMPLATE_QUESTION_IDS', () => {
    it('exports stable non-UUID string IDs for each built-in question', () => {
        expect(TEMPLATE_QUESTION_IDS.overnight).toBe('template-question-overnight')
        expect(TEMPLATE_QUESTION_IDS.abroad).toBe('template-question-abroad')
        expect(TEMPLATE_QUESTION_IDS.weather).toBe('template-question-weather')
        expect(TEMPLATE_QUESTION_IDS.transport).toBe('template-question-transport')
        expect(TEMPLATE_QUESTION_IDS.accommodation).toBe('template-question-accommodation')
        expect(TEMPLATE_QUESTION_IDS.activities).toBe('template-question-activities')
    })
})

describe('WIZARD_TEMPLATE_VERSION', () => {
    it('is a positive integer', () => {
        expect(Number.isInteger(WIZARD_TEMPLATE_VERSION)).toBe(true)
        expect(WIZARD_TEMPLATE_VERSION).toBeGreaterThan(0)
    })
})

describe('createExampleData', () => {
    it('uses stable IDs for the built-in questions', () => {
        const result = createExampleData(people)
        const ids = result.questions.map(q => q.id)
        expect(ids).toContain(TEMPLATE_QUESTION_IDS.overnight)
        expect(ids).toContain(TEMPLATE_QUESTION_IDS.abroad)
        expect(ids).toContain(TEMPLATE_QUESTION_IDS.weather)
        expect(ids).toContain(TEMPLATE_QUESTION_IDS.transport)
        expect(ids).toContain(TEMPLATE_QUESTION_IDS.accommodation)
        expect(ids).toContain(TEMPLATE_QUESTION_IDS.activities)
    })

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

    it('includes Headphones and Phone charger in alwaysNeededItems for adults', () => {
        const result = createExampleData([adult])
        expect(result.alwaysNeededItems.find(i => i.text === 'Headphones')).toBeTruthy()
        expect(result.alwaysNeededItems.find(i => i.text === 'Phone charger')).toBeTruthy()
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

    it('keeps group paperwork communal with adults as the trigger', () => {
        const result = createExampleData([adult, baby])
        for (const text of ['Local currency', 'Copies of important documents']) {
            const found = getAbroadYesItems(result).find(i => i.text === text)
            expect(found, `"${text}" should appear`).toBeTruthy()
            expect(found!.communal, `"${text}" should be communal`).toBe(true)
            expect(found!.personSelections.find(ps => ps.personId === adult.id)?.selected).toBe(true)
            expect(found!.personSelections.find(ps => ps.personId === baby.id)?.selected).toBe(false)
        }
    })

    it('gives every traveller their own visa and health card, babies included', () => {
        const result = createExampleData([adult, baby])
        for (const text of ['Visa', 'EHIC/GHIC card']) {
            const found = getAbroadYesItems(result).find(i => i.text === text)
            expect(found, `"${text}" should appear`).toBeTruthy()
            expect(found!.personSelections.find(ps => ps.personId === adult.id)?.selected).toBe(true)
            expect(found!.personSelections.find(ps => ps.personId === baby.id)?.selected).toBe(true)
        }
    })

    it('keeps travel insurance available to a group with no adults', () => {
        const teenager: Person = { id: 't1', name: 'Tam', ageRange: 'Teenager' }
        const result = createExampleData([teenager])
        const insurance = getAbroadYesItems(result).find(i => i.text === 'Travel insurance documents')
        expect(insurance).toBeTruthy()
        expect(insurance!.personSelections.find(ps => ps.personId === teenager.id)?.selected).toBe(true)
    })

    it('includes Travel adapter per person rather than one for the group', () => {
        const result = createExampleData([adult])
        const adapter = getAbroadYesItems(result).find(i => i.text === 'Travel adapter')
        expect(adapter).toBeTruthy()
        expect(adapter!.communal).toBeUndefined()
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

    // Razors are near-universal, so the item is offered to every teenager and
    // adult rather than filtered to men — anyone who doesn't want one unticks it.
    it('offers a razor to every teenager and adult regardless of gender', () => {
        const result = createExampleData([femaleAdult, maleAdult])
        const items = getOvernightYesItems(result)
        const item = items.find(i => i.text === 'Razor / shaving kit')
        expect(item).toBeTruthy()
        expect(item!.personSelections.find(ps => ps.personId === maleAdult.id)?.selected).toBe(true)
        expect(item!.personSelections.find(ps => ps.personId === femaleAdult.id)?.selected).toBe(true)
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

        const toothpaste = items.find(i => i.text === 'Toothpaste')!
        expect(toothpaste.communal).toBe(true)
    })

    it('keeps personal items per-person', () => {
        const result = createExampleData(family)
        const items = allItems(result)
        expect(result.alwaysNeededItems.find(i => i.text === 'Snacks')?.communal).toBeUndefined()
        expect(items.find(i => i.text === 'Toothbrush')?.communal).toBeUndefined()
        expect(items.find(i => i.text === 'Passport')?.communal).toBeUndefined()
    })
})

describe('createExampleData - transport and accommodation', () => {
    const family: Person[] = [
        { id: 'a1', name: 'Alice', ageRange: 'Adult', gender: 'female' },
        { id: 'b1', name: 'Bea', ageRange: 'Baby' },
    ]

    const question = (result: ReturnType<typeof createExampleData>, id: string) =>
        result.questions.find(q => q.id === id)!

    // Families mix: fly out and hire a car, two nights at grandparents then a
    // week in a cottage. Both questions have to accept more than one answer.
    it('makes both questions multiple-choice so a mixed trip can be described', () => {
        const result = createExampleData(family)
        expect(question(result, TEMPLATE_QUESTION_IDS.transport).questionType).toBe('multiple-choice')
        expect(question(result, TEMPLATE_QUESTION_IDS.accommodation).questionType).toBe('multiple-choice')
    })

    it('carries self-catering as an accommodation option rather than its own question', () => {
        const result = createExampleData(family)
        const accommodation = question(result, TEMPLATE_QUESTION_IDS.accommodation)
        const selfCatering = accommodation.options.find(o => o.id === ACCOMMODATION_OPTION_IDS.selfCatering)!
        expect(selfCatering).toBeTruthy()
        expect(selfCatering.items.map(i => i.text)).toEqual(
            expect.arrayContaining(['Dish soap and sponge', 'Dishwasher tablets', 'Tea towels'])
        )
        expect(result.questions.find(q => q.text === 'Are you self-catering?')).toBeUndefined()
    })

    it('packs the self-catering kitchen items once for the group, not per adult', () => {
        const result = createExampleData(family)
        const selfCatering = question(result, TEMPLATE_QUESTION_IDS.accommodation)
            .options.find(o => o.id === ACCOMMODATION_OPTION_IDS.selfCatering)!
        for (const text of ['Dish soap and sponge', 'Dishwasher tablets', 'Tea towels']) {
            expect(selfCatering.items.find(i => i.text === text)!.communal, text).toBe(true)
        }
    })

    // Two different trips: a tent needs pegs and a stove, a caravan needs a
    // hook-up cable and toilet chemicals, and neither list suits the other.
    it('keeps camping and caravanning as separate options', () => {
        const accommodation = question(createExampleData(family), TEMPLATE_QUESTION_IDS.accommodation)
        const optionIds = accommodation.options.map(o => o.id)
        expect(optionIds).toContain(ACCOMMODATION_OPTION_IDS.camping)
        expect(optionIds).toContain(ACCOMMODATION_OPTION_IDS.caravan)

        const textOf = (id: string) => accommodation.options.find(o => o.id === id)!.text
        expect(textOf(ACCOMMODATION_OPTION_IDS.camping)).toBe('Camping')
        expect(textOf(ACCOMMODATION_OPTION_IDS.caravan)).toBe('Caravan or motorhome')
    })

    it('puts the tent and its pegs under camping only', () => {
        const accommodation = question(createExampleData(family), TEMPLATE_QUESTION_IDS.accommodation)
        const itemsIn = (id: string) =>
            accommodation.options.find(o => o.id === id)!.items.map(i => i.text)

        expect(itemsIn(ACCOMMODATION_OPTION_IDS.camping)).toEqual(
            expect.arrayContaining(['Tent', 'Tent pegs and mallet', 'Sleeping bag', 'Camping stove and gas'])
        )
        for (const text of ['Tent', 'Tent pegs and mallet', 'Sleeping bag']) {
            expect(itemsIn(ACCOMMODATION_OPTION_IDS.caravan), `caravan should not carry "${text}"`).not.toContain(text)
        }
        expect(itemsIn(ACCOMMODATION_OPTION_IDS.caravan)).toEqual(
            expect.arrayContaining(['Electric hook-up cable', 'Toilet chemicals', 'Bedding'])
        )
        expect(itemsIn(ACCOMMODATION_OPTION_IDS.camping)).not.toContain('Electric hook-up cable')
    })

    it('offers a car seat for under-teens when driving', () => {
        const result = createExampleData(family)
        const driving = question(result, TEMPLATE_QUESTION_IDS.transport)
            .options.find(o => o.id === TRANSPORT_OPTION_IDS.driving)!
        const carSeat = driving.items.find(i => i.text === 'Car seat')!
        expect(carSeat).toBeTruthy()
        expect(carSeat.personSelections.find(ps => ps.personId === 'b1')?.selected).toBe(true)
        expect(carSeat.personSelections.find(ps => ps.personId === 'a1')?.selected).toBe(false)
    })
})

describe('createExampleData - items shared across options', () => {
    const family: Person[] = [
        { id: 'a1', name: 'Alice', ageRange: 'Adult', gender: 'female' },
        { id: 'c1', name: 'Cal', ageRange: 'Child' },
        { id: 't1', name: 'Tod', ageRange: 'Toddler' },
        { id: 'b1', name: 'Bea', ageRange: 'Baby' },
    ]

    function everyItem(result: ReturnType<typeof createExampleData>) {
        return [
            ...result.alwaysNeededItems,
            ...result.questions.flatMap(q => q.options.flatMap(o => o.items)),
        ]
    }

    const selectedIds = (i: { personSelections: { personId: string; selected: boolean }[] }) =>
        i.personSelections.filter(ps => ps.selected).map(ps => ps.personId)

    /**
     * The generated list deduplicates on `personId` + lowercased text, so the
     * same item reaching one person twice is collapsed for us — quantities are
     * merged by `deduplicateItems`, which takes the largest.
     *
     * What it cannot resolve is the *section*: the surviving row keeps the first
     * copy's category, so two copies filed differently would land under
     * whichever option sorts first. Keeping them consistent is a content
     * concern, and the communal flag has to match too — it decides identity, so
     * a mismatch means the copies never collapse at all.
     */
    it('gives identically-named items the same section and communal flag wherever they can collide', () => {
        const all = everyItem(createExampleData(family))
        const byText = new Map<string, typeof all>()
        for (const i of all) {
            const key = i.text.trim().toLowerCase()
            byText.set(key, [...(byText.get(key) ?? []), i])
        }

        for (const [text, copies] of byText) {
            if (copies.length < 2) continue
            for (let a = 0; a < copies.length; a++) {
                for (let b = a + 1; b < copies.length; b++) {
                    const [x, y] = [copies[a], copies[b]]
                    // Communal items all dedupe against each other (personId '');
                    // per-person copies only collide if they share a person.
                    const collides = (x.communal && y.communal)
                        || selectedIds(x).some(id => selectedIds(y).includes(id))
                    if (!collides) continue
                    expect(x.communal ?? false, `"${text}" communal flag differs between copies`)
                        .toBe(y.communal ?? false)
                    // The surviving copy takes its category with it, so a
                    // mismatch files the row under whichever option sorts first.
                    expect(x.category, `"${text}" category differs between copies`).toBe(y.category)
                }
            }
        }
    })

    it('keeps the two Spare clothes rates apart because they reach different people', () => {
        const all = everyItem(createExampleData(family))
        const spares = all.filter(i => i.text === 'Spare clothes')
        expect(spares).toHaveLength(2)
        expect(selectedIds(spares[0])).not.toEqual(selectedIds(spares[1]))
    })
})

describe('createExampleData - quantity rates', () => {
    const adult: Person = { id: 'a1', name: 'Alice', ageRange: 'Adult' }
    const baby: Person = { id: 'b1', name: 'Bea', ageRange: 'Baby' }

    function getOvernightYesItems(result: ReturnType<typeof createExampleData>) {
        const overnight = result.questions.find(q => q.id === TEMPLATE_QUESTION_IDS.overnight)!
        return overnight.options.find(o => o.text === 'Yes')!.items
    }

    it('scales every clothing item with trip length', () => {
        const items = getOvernightYesItems(createExampleData([adult]))
        for (const text of ['Underwear', 'Socks', 'T-shirt/Top', 'Trousers/Shorts', 'Jumper', 'Pyjamas']) {
            expect(items.find(i => i.text === text)!.perNight, `"${text}" needs a rate`).toBeGreaterThan(0)
        }
    })

    it('caps the items that would otherwise suggest one per night indefinitely', () => {
        const items = getOvernightYesItems(createExampleData([adult]))
        for (const text of ['Underwear', 'Socks', 'T-shirt/Top']) {
            expect(items.find(i => i.text === text)!.maxQuantity, `"${text}" needs a cap`).toBeGreaterThan(0)
        }
    })

    it('scales baby consumables with trip length', () => {
        const result = createExampleData([adult, baby])
        const nappies = result.alwaysNeededItems.find(i => i.text === 'Nappies (pack/supply)')!
        expect(nappies.perNight).toBeGreaterThan(0)
        expect(nappies.maxQuantity).toBeUndefined()
        expect(result.alwaysNeededItems.find(i => i.text === 'Formula/Baby food')!.perNight).toBeGreaterThan(0)
    })
})

describe('createExampleData - potty-training toddlers', () => {
    const adult: Person = { id: 'a1', name: 'Alice', ageRange: 'Adult' }
    const toddler: Person = { id: 't1', name: 'Tod', ageRange: 'Toddler' }
    const child: Person = { id: 'c1', name: 'Cal', ageRange: 'Child' }
    const family = [adult, toddler, child]

    function clothesItems(people: Person[]) {
        const overnight = createExampleData(people).questions
            .find(q => q.id === TEMPLATE_QUESTION_IDS.overnight)!
        return overnight.options.find(o => o.text === 'Yes')!.items
    }

    const packsFor = (item: Item, personId: string) =>
        item.personSelections.some(ps => ps.personId === personId && ps.selected)

    /** Pairs per night the template suggests for one person, largest rate wins. */
    function ratePerNight(items: Item[], text: string, personId: string): number {
        const rates = items
            .filter(i => i.text === text && packsFor(i, personId))
            .map(i => (i.perNight ?? 0) / (i.perNights ?? 1))
        expect(rates.length, `nothing packs "${text}" for ${personId}`).toBeGreaterThan(0)
        return Math.max(...rates)
    }

    it('packs more than one pair of trousers/shorts a day for a toddler', () => {
        const items = clothesItems(family)
        expect(ratePerNight(items, 'Trousers/Shorts', toddler.id)).toBeGreaterThan(1)
    })

    it('packs more than one pair of underwear a day for a toddler', () => {
        const items = clothesItems(family)
        expect(ratePerNight(items, 'Underwear', toddler.id)).toBeGreaterThan(1)
    })

    it('leaves everyone else on the ordinary rate', () => {
        const items = clothesItems(family)
        for (const person of [adult, child]) {
            expect(ratePerNight(items, 'Trousers/Shorts', person.id),
                `${person.name} should keep the ordinary trousers rate`).toBeLessThanOrEqual(1)
            expect(ratePerNight(items, 'Underwear', person.id),
                `${person.name} should keep the ordinary underwear rate`).toBeLessThanOrEqual(1)
        }
    })

    // The toddler copy shares its text with the general one, so `deduplicateItems`
    // collapses the pair and keeps the larger quantity. This is the number the
    // user actually sees.
    it('shows the toddler the bigger number on the generated list', () => {
        const nights = 4
        const result = createExampleData(family)
        const overnight = result.questions.find(q => q.id === TEMPLATE_QUESTION_IDS.overnight)!
        const yes = overnight.options.find(o => o.text === 'Yes')!
        const generated = deduplicateItems(generateQuestionBasedItems(
            result.questions,
            [{ questionId: overnight.id, selectedOptionIds: [yes.id] }],
            family,
            family.map(p => p.id),
            nights,
        ))

        const rowFor = (text: string, personId: string) => {
            const rows = generated.filter(i => i.itemText === text && i.personId === personId)
            expect(rows, `one row expected for "${text}"`).toHaveLength(1)
            return rows[0]
        }

        expect(rowFor('Trousers/Shorts', toddler.id).quantity).toBeGreaterThan(nights)
        expect(rowFor('Underwear', toddler.id).quantity).toBeGreaterThan(nights)
        expect(rowFor('Trousers/Shorts', adult.id).quantity).toBeLessThanOrEqual(nights)
    })
})

describe('createExampleData - groups with no adults', () => {
    // `items()` drops any item nobody is selected for, so a communal item
    // filtered to adults vanishes from the set entirely rather than falling to
    // whoever is actually travelling.
    const teenager: Person = { id: 't1', name: 'Tam', ageRange: 'Teenager' }
    const child: Person = { id: 'c1', name: 'Cal', ageRange: 'Child' }

    it('still packs shared toiletries and pain relief', () => {
        const result = createExampleData([teenager, child])
        const overnightYes = result.questions
            .find(q => q.id === TEMPLATE_QUESTION_IDS.overnight)!
            .options.find(o => o.text === 'Yes')!
        expect(overnightYes.items.find(i => i.text === 'Toothpaste')).toBeTruthy()
        expect(result.alwaysNeededItems.find(i => i.text === 'Pain relief (paracetamol / ibuprofen)')).toBeTruthy()
    })

    it('leaves no answerable option completely empty', () => {
        const result = createExampleData([teenager, child])
        for (const question of result.questions) {
            for (const option of question.options) {
                if (option.text === 'No') continue
                expect(option.items.length, `"${question.text} — ${option.text}" is empty`).toBeGreaterThan(0)
            }
        }
    })
})

describe('createExampleData - ageRanges tagging', () => {
    const family: Person[] = [
        { id: 'a1', name: 'Alice', ageRange: 'Adult', gender: 'female' },
        { id: 'b1', name: 'Bea', ageRange: 'Baby' },
    ]

    it('tags age-filtered items with the brackets they apply to', () => {
        const result = createExampleData(family)
        const nappies = result.alwaysNeededItems.find(i => i.text === 'Nappies (pack/supply)')!
        expect(nappies.ageRanges).toEqual(['Baby'])

        const swimming = result.questions
            .find(q => q.text === 'What activities will you be doing?')!
            .options.find(o => o.id === ACTIVITY_OPTION_IDS.swimming)!
        const swimsuit = swimming.items.find(i => i.text === 'Swimsuit')!
        expect(swimsuit.ageRanges).toEqual(['Toddler', 'Child', 'Teenager', 'Adult'])
    })

    it('leaves everyone-items and gender-filtered items untagged', () => {
        const result = createExampleData(family)
        const medication = result.alwaysNeededItems.find(i => i.text === 'Prescription medication')!
        expect(medication.ageRanges).toBeUndefined()

        const overnightYes = result.questions
            .find(q => q.text === 'Will you be staying overnight?')!
            .options.find(o => o.text === 'Yes')!
        const bra = overnightYes.items.find(i => i.text === 'Bra')!
        expect(bra.ageRanges).toBeUndefined()
    })
})
