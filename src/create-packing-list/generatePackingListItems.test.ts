import { describe, it, expect } from 'vitest'
import { generateQuestionBasedItems } from './generatePackingListItems'
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
