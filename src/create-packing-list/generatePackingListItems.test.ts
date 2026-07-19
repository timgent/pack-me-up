import { describe, it, expect } from 'vitest'
import { generateQuestionBasedItems, generateAlwaysNeededItems, withItemOrder } from './generatePackingListItems'
import { Question } from '../edit-questions/types'

const p1 = { id: 'p1', name: 'Alice' }
const p2 = { id: 'p2', name: 'Bob' }

const swimmingOpt = {
    id: 'opt-swimming',
    text: 'Swimming',
    order: 0,
    items: [
        { text: 'Swimsuit', personSelections: [{ personId: 'p1', selected: true }] },
        { text: 'Goggles', personSelections: [{ personId: 'p1', selected: true }] },
    ],
}
const runningOpt = {
    id: 'opt-running',
    text: 'Running',
    order: 1,
    items: [
        { text: 'Running shoes', personSelections: [{ personId: 'p1', selected: true }] },
        { text: 'Running socks', personSelections: [{ personId: 'p1', selected: true }] },
    ],
}
const hikingOpt = {
    id: 'opt-hiking',
    text: 'Hiking',
    order: 2,
    items: [
        { text: 'Hiking boots', personSelections: [{ personId: 'p1', selected: true }] },
    ],
}

const activitiesQuestion: Question = {
    id: 'q-activities',
    type: 'saved',
    text: 'What activities will you be doing?',
    order: 0,
    questionType: 'multiple-choice',
    options: [swimmingOpt, runningOpt, hikingOpt],
}

const overnightQuestion: Question = {
    id: 'q-overnight',
    type: 'saved',
    text: 'Staying overnight?',
    order: 1,
    questionType: 'single-choice',
    options: [
        {
            id: 'opt-yes',
            text: 'Yes',
            order: 0,
            items: [{ text: 'Toothbrush', personSelections: [{ personId: 'p1', selected: true }] }],
        },
        {
            id: 'opt-no',
            text: 'No',
            order: 1,
            items: [],
        },
    ],
}

// ─── Core regression test from issue #205 ────────────────────────────────────

describe('generateQuestionBasedItems – unselected options contribute no items', () => {
    it('excludes items from options that were not selected (the issue #205 regression)', () => {
        const answers = [
            { questionId: 'q-activities', selectedOptionIds: ['opt-swimming', 'opt-hiking'] },
        ]
        const result = generateQuestionBasedItems(
            [activitiesQuestion],
            answers,
            [p1],
            ['p1']
        )

        const itemTexts = result.map(i => i.itemText)
        // Swimming and Hiking items should be present
        expect(itemTexts).toContain('Swimsuit')
        expect(itemTexts).toContain('Goggles')
        expect(itemTexts).toContain('Hiking boots')
        // Running items must NOT appear even though Running is in the question set
        expect(itemTexts).not.toContain('Running shoes')
        expect(itemTexts).not.toContain('Running socks')
    })

    it('produces no items when no options are selected for a multiple-choice question', () => {
        const answers = [{ questionId: 'q-activities', selectedOptionIds: [] }]
        const result = generateQuestionBasedItems([activitiesQuestion], answers, [p1], ['p1'])
        expect(result).toHaveLength(0)
    })

    it('produces no items when selectedOptionIds is missing (user skipped the question)', () => {
        const answers = [{ questionId: 'q-activities' }]
        const result = generateQuestionBasedItems([activitiesQuestion], answers, [p1], ['p1'])
        expect(result).toHaveLength(0)
    })
})

// ─── Selected options do contribute items ─────────────────────────────────────

describe('generateQuestionBasedItems – selected options contribute items', () => {
    it('includes all items from all selected options', () => {
        const answers = [
            { questionId: 'q-activities', selectedOptionIds: ['opt-swimming', 'opt-running'] },
        ]
        const result = generateQuestionBasedItems([activitiesQuestion], answers, [p1], ['p1'])
        const itemTexts = result.map(i => i.itemText)
        expect(itemTexts).toContain('Swimsuit')
        expect(itemTexts).toContain('Goggles')
        expect(itemTexts).toContain('Running shoes')
        expect(itemTexts).toContain('Running socks')
        expect(itemTexts).not.toContain('Hiking boots')
    })

    it('includes only items for selected people', () => {
        const optWithTwoPeople = {
            id: 'opt-swimming',
            text: 'Swimming',
            order: 0,
            items: [
                {
                    text: 'Swimsuit',
                    personSelections: [
                        { personId: 'p1', selected: true },
                        { personId: 'p2', selected: true },
                    ],
                },
            ],
        }
        const q: Question = { ...activitiesQuestion, options: [optWithTwoPeople] }
        const answers = [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }]

        // Only p1 is travelling
        const result = generateQuestionBasedItems([q], answers, [p1, p2], ['p1'])
        expect(result).toHaveLength(1)
        expect(result[0].personId).toBe('p1')
    })

    it('sets category to option text for multiple-choice questions', () => {
        const answers = [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }]
        const result = generateQuestionBasedItems([activitiesQuestion], answers, [p1], ['p1'])
        result.forEach(item => expect(item.category).toBe('Swimming'))
    })

    it('sets category to question text for single-choice questions', () => {
        const answers = [{ questionId: 'q-overnight', selectedOptionIds: ['opt-yes'] }]
        const result = generateQuestionBasedItems([overnightQuestion], answers, [p1], ['p1'])
        result.forEach(item => expect(item.category).toBe('Staying overnight?'))
    })

    it('processes multiple questions and merges their items', () => {
        const answers = [
            { questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] },
            { questionId: 'q-overnight', selectedOptionIds: ['opt-yes'] },
        ]
        const result = generateQuestionBasedItems(
            [activitiesQuestion, overnightQuestion],
            answers,
            [p1],
            ['p1']
        )
        const itemTexts = result.map(i => i.itemText)
        expect(itemTexts).toContain('Swimsuit')
        expect(itemTexts).toContain('Toothbrush')
    })

    it('returns empty array when questionAnswers is empty', () => {
        const result = generateQuestionBasedItems([activitiesQuestion], [], [p1], ['p1'])
        expect(result).toHaveLength(0)
    })

    it('skips a question when the questionId does not match any question', () => {
        const answers = [{ questionId: 'unknown-id', selectedOptionIds: ['opt-swimming'] }]
        const result = generateQuestionBasedItems([activitiesQuestion], answers, [p1], ['p1'])
        expect(result).toHaveLength(0)
    })
})

// ─── Communal items ───────────────────────────────────────────────────────────

describe('generateQuestionBasedItems – communal items', () => {
    const campingQuestion: Question = {
        id: 'q-camping',
        type: 'saved',
        text: 'Are you camping?',
        order: 0,
        questionType: 'single-choice',
        options: [
            {
                id: 'opt-yes',
                text: 'Yes',
                order: 0,
                items: [
                    {
                        text: 'Tent',
                        communal: true,
                        personSelections: [
                            { personId: 'p1', selected: true },
                            { personId: 'p2', selected: true },
                        ],
                    },
                    {
                        text: 'Sleeping bag',
                        personSelections: [
                            { personId: 'p1', selected: true },
                            { personId: 'p2', selected: true },
                        ],
                    },
                ],
            },
        ],
    }
    const answers = [{ questionId: 'q-camping', selectedOptionIds: ['opt-yes'] }]

    it('generates a single entry for a communal item regardless of traveller count', () => {
        const result = generateQuestionBasedItems([campingQuestion], answers, [p1, p2], ['p1', 'p2'])
        const tents = result.filter(i => i.itemText === 'Tent')
        expect(tents).toHaveLength(1)
        expect(tents[0].communal).toBe(true)
        expect(tents[0].personId).toBe('')
        expect(tents[0].personName).toBe('')
        // Per-person items still fan out
        expect(result.filter(i => i.itemText === 'Sleeping bag')).toHaveLength(2)
    })

    it('includes a communal item when at least one trigger person is travelling', () => {
        const babyGear: Question = {
            ...campingQuestion,
            options: [{
                id: 'opt-yes',
                text: 'Yes',
                order: 0,
                items: [{
                    text: 'Travel cot',
                    communal: true,
                    personSelections: [{ personId: 'p2', selected: true }],
                }],
            }],
        }
        const withBaby = generateQuestionBasedItems([babyGear], answers, [p1, p2], ['p1', 'p2'])
        expect(withBaby.map(i => i.itemText)).toContain('Travel cot')

        const withoutBaby = generateQuestionBasedItems([babyGear], answers, [p1, p2], ['p1'])
        expect(withoutBaby.map(i => i.itemText)).not.toContain('Travel cot')
    })

    it('excludes a communal item when no trigger people are selected on the item', () => {
        const q: Question = {
            ...campingQuestion,
            options: [{
                id: 'opt-yes',
                text: 'Yes',
                order: 0,
                items: [{
                    text: 'Tent',
                    communal: true,
                    personSelections: [
                        { personId: 'p1', selected: false },
                        { personId: 'p2', selected: false },
                    ],
                }],
            }],
        }
        const result = generateQuestionBasedItems([q], answers, [p1, p2], ['p1', 'p2'])
        expect(result).toHaveLength(0)
    })

    it('always includes a communal item that has no person selections', () => {
        const q: Question = {
            ...campingQuestion,
            options: [{
                id: 'opt-yes',
                text: 'Yes',
                order: 0,
                items: [{ text: 'First aid kit', communal: true, personSelections: [] }],
            }],
        }
        const result = generateQuestionBasedItems([q], answers, [p1, p2], ['p1'])
        expect(result.map(i => i.itemText)).toContain('First aid kit')
    })

    it('sets the category on communal items like per-person items', () => {
        const result = generateQuestionBasedItems([campingQuestion], answers, [p1], ['p1'])
        const tent = result.find(i => i.itemText === 'Tent')
        expect(tent?.category).toBe('Are you camping?')
    })
})

// ─── Quantity suggestions from nights away ────────────────────────────────────

describe('quantity suggestions from nights away', () => {
    const overnightWithRates: Question = {
        id: 'q-overnight',
        type: 'saved',
        text: 'Staying overnight?',
        order: 0,
        questionType: 'single-choice',
        options: [
            {
                id: 'opt-yes',
                text: 'Yes',
                order: 0,
                items: [
                    { text: 'Socks', perNight: 1, personSelections: [{ personId: 'p1', selected: true }] },
                    { text: 'Underwear', perNight: 2, personSelections: [{ personId: 'p1', selected: true }] },
                    { text: 'Pyjamas', perNight: 1, maxQuantity: 2, personSelections: [{ personId: 'p1', selected: true }] },
                    { text: 'Toothbrush', personSelections: [{ personId: 'p1', selected: true }] },
                ],
            },
        ],
    }
    const answers = [{ questionId: 'q-overnight', selectedOptionIds: ['opt-yes'] }]

    it('multiplies the per-night rate by the number of nights', () => {
        const result = generateQuestionBasedItems([overnightWithRates], answers, [p1], ['p1'], 3)
        expect(result.find(i => i.itemText === 'Socks')?.quantity).toBe(3)
        expect(result.find(i => i.itemText === 'Underwear')?.quantity).toBe(6)
    })

    it('caps the suggestion at maxQuantity', () => {
        const result = generateQuestionBasedItems([overnightWithRates], answers, [p1], ['p1'], 7)
        expect(result.find(i => i.itemText === 'Pyjamas')?.quantity).toBe(2)
    })

    it('leaves quantity unset for items without a per-night rate', () => {
        const result = generateQuestionBasedItems([overnightWithRates], answers, [p1], ['p1'], 3)
        expect(result.find(i => i.itemText === 'Toothbrush')?.quantity).toBeUndefined()
    })

    it('leaves quantity unset when nights is not provided', () => {
        const result = generateQuestionBasedItems([overnightWithRates], answers, [p1], ['p1'])
        result.forEach(item => expect(item.quantity).toBeUndefined())
    })

    it('suggests at least 1 even for very short trips', () => {
        const result = generateQuestionBasedItems([overnightWithRates], answers, [p1], ['p1'], 1)
        expect(result.find(i => i.itemText === 'Socks')?.quantity).toBe(1)
    })

    it('supports "1 per N nights" rates via perNights, rounding the suggestion up', () => {
        const q: Question = {
            ...overnightWithRates,
            options: [{
                id: 'opt-yes',
                text: 'Yes',
                order: 0,
                items: [
                    // One jumper every 4 nights, one t-shirt every 2 nights
                    { text: 'Jumper', perNight: 1, perNights: 4, personSelections: [{ personId: 'p1', selected: true }] },
                    { text: 'T-shirt', perNight: 1, perNights: 2, personSelections: [{ personId: 'p1', selected: true }] },
                ],
            }],
        }
        const threeNights = generateQuestionBasedItems([q], answers, [p1], ['p1'], 3)
        expect(threeNights.find(i => i.itemText === 'Jumper')?.quantity).toBe(1)  // ceil(0.75)
        expect(threeNights.find(i => i.itemText === 'T-shirt')?.quantity).toBe(2) // ceil(1.5)

        const sevenNights = generateQuestionBasedItems([q], answers, [p1], ['p1'], 7)
        expect(sevenNights.find(i => i.itemText === 'Jumper')?.quantity).toBe(2)  // ceil(1.75)
        expect(sevenNights.find(i => i.itemText === 'T-shirt')?.quantity).toBe(4) // ceil(3.5)
    })

    it('still supports fractional perNight rates without a perNights divisor', () => {
        const q: Question = {
            ...overnightWithRates,
            options: [{
                id: 'opt-yes',
                text: 'Yes',
                order: 0,
                items: [{ text: 'Jumper', perNight: 0.25, personSelections: [{ personId: 'p1', selected: true }] }],
            }],
        }
        const result = generateQuestionBasedItems([q], answers, [p1], ['p1'], 7)
        expect(result.find(i => i.itemText === 'Jumper')?.quantity).toBe(2) // ceil(1.75)
    })

    it('applies rates to communal items too', () => {
        const q: Question = {
            ...overnightWithRates,
            options: [{
                id: 'opt-yes',
                text: 'Yes',
                order: 0,
                items: [{
                    text: 'Nappies',
                    communal: true,
                    perNight: 6,
                    personSelections: [{ personId: 'p1', selected: true }],
                }],
            }],
        }
        const result = generateQuestionBasedItems([q], answers, [p1], ['p1'], 2)
        expect(result.find(i => i.itemText === 'Nappies')?.quantity).toBe(12)
    })

    it('applies rates to always-needed items', () => {
        const result = generateAlwaysNeededItems(
            [{ text: 'Socks', perNight: 1, personSelections: [{ personId: 'p1', selected: true }] }],
            [p1],
            ['p1'],
            4
        )
        expect(result[0].quantity).toBe(4)
    })
})

// ─── Always-needed items ──────────────────────────────────────────────────────

describe('generateAlwaysNeededItems', () => {
    it('fans out per-person items to each selected traveller', () => {
        const result = generateAlwaysNeededItems(
            [{
                text: 'Water bottle',
                personSelections: [
                    { personId: 'p1', selected: true },
                    { personId: 'p2', selected: true },
                ],
            }],
            [p1, p2],
            ['p1', 'p2']
        )
        expect(result).toHaveLength(2)
        expect(result.map(i => i.personName).sort()).toEqual(['Alice', 'Bob'])
        result.forEach(item => {
            expect(item.questionId).toBe('always-needed')
            expect(item.optionId).toBe('always-needed')
            expect(item.category).toBe('Essentials')
        })
    })

    it('excludes people who are not travelling', () => {
        const result = generateAlwaysNeededItems(
            [{
                text: 'Water bottle',
                personSelections: [
                    { personId: 'p1', selected: true },
                    { personId: 'p2', selected: true },
                ],
            }],
            [p1, p2],
            ['p2']
        )
        expect(result).toHaveLength(1)
        expect(result[0].personName).toBe('Bob')
    })

    it('generates a single shared entry for communal items', () => {
        const result = generateAlwaysNeededItems(
            [{
                text: 'First aid kit',
                communal: true,
                personSelections: [
                    { personId: 'p1', selected: true },
                    { personId: 'p2', selected: true },
                ],
            }],
            [p1, p2],
            ['p1', 'p2']
        )
        expect(result).toHaveLength(1)
        expect(result[0].communal).toBe(true)
        expect(result[0].personId).toBe('')
        expect(result[0].personName).toBe('')
        expect(result[0].category).toBe('Essentials')
    })

    it('excludes a communal item when none of its trigger people are travelling', () => {
        const result = generateAlwaysNeededItems(
            [{
                text: 'Litter tray',
                communal: true,
                personSelections: [{ personId: 'p2', selected: true }],
            }],
            [p1, p2],
            ['p1']
        )
        expect(result).toHaveLength(0)
    })
})

// ─── Ordering: generated items follow the question set's order ───────────────

describe('generateQuestionBasedItems – ordering', () => {
    it('follows question order even when answers arrive in a different order', () => {
        const answers = [
            { questionId: 'q-overnight', selectedOptionIds: ['opt-yes'] },
            { questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] },
        ]
        const result = generateQuestionBasedItems(
            [activitiesQuestion, overnightQuestion],
            answers,
            [p1],
            ['p1']
        )
        expect(result.map(i => i.itemText)).toEqual(['Swimsuit', 'Goggles', 'Toothbrush'])
    })

    it('follows option order regardless of the order options were selected in', () => {
        const answers = [
            { questionId: 'q-activities', selectedOptionIds: ['opt-hiking', 'opt-swimming'] },
        ]
        const result = generateQuestionBasedItems(
            [activitiesQuestion],
            answers,
            [p1],
            ['p1']
        )
        expect(result.map(i => i.itemText)).toEqual(['Swimsuit', 'Goggles', 'Hiking boots'])
    })

    it('follows item order fields within an option when present', () => {
        const question: Question = {
            id: 'q-1',
            type: 'saved',
            text: 'Camping?',
            order: 0,
            options: [{
                id: 'opt-yes',
                text: 'Yes',
                order: 0,
                items: [
                    { text: 'Sleeping bag', order: 1, personSelections: [{ personId: 'p1', selected: true }] },
                    { text: 'Tent', order: 0, personSelections: [{ personId: 'p1', selected: true }] },
                ],
            }],
        }
        const result = generateQuestionBasedItems(
            [question],
            [{ questionId: 'q-1', selectedOptionIds: ['opt-yes'] }],
            [p1],
            ['p1']
        )
        expect(result.map(i => i.itemText)).toEqual(['Tent', 'Sleeping bag'])
    })
})

describe('withItemOrder', () => {
    it('stamps a sequential order onto assembled list items', () => {
        const items = [
            { id: '1', itemText: 'Tent', personId: '', personName: '', questionId: 'q', optionId: 'o', packed: false },
            { id: '2', itemText: 'Map', personId: '', personName: '', questionId: 'q', optionId: 'o', packed: false },
        ]
        expect(withItemOrder(items).map(i => i.order)).toEqual([0, 1])
    })
})
