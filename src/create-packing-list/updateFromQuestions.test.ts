import { describe, it, expect } from 'vitest'
import { computeQuestionSetAdditions, reconstructGenerationInputs } from './updateFromQuestions'
import { PackingList, PackingListItem } from './types'
import { PackingListQuestionSet, Question, Person, Item } from '../edit-questions/types'

const alice: Person = { id: 'p1', name: 'Alice' }
const bob: Person = { id: 'p2', name: 'Bob' }

function makeItem(text: string, personIds: string[], extra: Partial<Item> = {}): Item {
    return {
        text,
        personSelections: personIds.map(id => ({ personId: id, selected: true })),
        ...extra,
    }
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
    return {
        id: 'q-activities',
        type: 'saved',
        text: 'Activities?',
        order: 0,
        questionType: 'multiple-choice',
        options: [],
        ...overrides,
    }
}

function makeQuestionSet(overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet {
    return { _id: '1', people: [alice, bob], alwaysNeededItems: [], questions: [], ...overrides }
}

function makeList(overrides: Partial<PackingList> = {}): PackingList {
    return {
        id: 'list-1',
        name: 'Trip',
        createdAt: '2024-01-01T00:00:00.000Z',
        items: [],
        selectedPeopleIds: ['p1', 'p2'],
        questionAnswers: [],
        ...overrides,
    }
}

// A packing-list item generated from a question option
function listItem(overrides: Partial<PackingListItem> = {}): PackingListItem {
    return {
        id: crypto.randomUUID(),
        itemText: 'Existing',
        personId: 'p1',
        personName: 'Alice',
        questionId: 'q-activities',
        optionId: 'opt-swimming',
        packed: false,
        ...overrides,
    }
}

describe('computeQuestionSetAdditions', () => {
    it('adds a new item in a selected option for each selected traveller', () => {
        const questionSet = makeQuestionSet({
            questions: [makeQuestion({
                options: [{
                    id: 'opt-swimming', text: 'Swimming', order: 0,
                    items: [makeItem('Goggles', ['p1', 'p2'])],
                }],
            })],
        })
        const list = makeList({
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
        })

        const additions = computeQuestionSetAdditions(list, questionSet)

        expect(additions.map(a => `${a.itemText}:${a.personName}`).sort())
            .toEqual(['Goggles:Alice', 'Goggles:Bob'])
        additions.forEach(a => {
            expect(a.packed).toBe(false)
            expect(a.id).toBeTruthy()
            expect(a.lastModified).toBeTruthy()
        })
    })

    it('does not add items from an option that was not selected', () => {
        const questionSet = makeQuestionSet({
            questions: [makeQuestion({
                options: [
                    { id: 'opt-swimming', text: 'Swimming', order: 0, items: [makeItem('Goggles', ['p1'])] },
                    { id: 'opt-hiking', text: 'Hiking', order: 1, items: [makeItem('Boots', ['p1'])] },
                ],
            })],
        })
        const list = makeList({
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
        })

        const additions = computeQuestionSetAdditions(list, questionSet)

        expect(additions.map(a => a.itemText)).toEqual(['Goggles'])
    })

    it('skips items already on the list, including hand-added custom items with the same text', () => {
        const questionSet = makeQuestionSet({
            questions: [makeQuestion({
                options: [{
                    id: 'opt-swimming', text: 'Swimming', order: 0,
                    items: [makeItem('Goggles', ['p1'])],
                }],
            })],
        })
        const list = makeList({
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
            // custom item added by hand with no questionId but same text/person
            items: [listItem({ itemText: 'goggles', personId: 'p1', personName: 'Alice', questionId: '', optionId: '' })],
        })

        const additions = computeQuestionSetAdditions(list, questionSet)

        expect(additions).toEqual([])
    })

    it('never resurrects an item the user previously deleted', () => {
        const questionSet = makeQuestionSet({
            questions: [makeQuestion({
                options: [{
                    id: 'opt-swimming', text: 'Swimming', order: 0,
                    items: [makeItem('Goggles', ['p1'])],
                }],
            })],
        })
        const list = makeList({
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
            deletedItems: [listItem({ itemText: 'Goggles', personId: 'p1', personName: 'Alice' })],
        })

        const additions = computeQuestionSetAdditions(list, questionSet)

        expect(additions).toEqual([])
    })

    it('respects communal trigger semantics and skips deleted communal items', () => {
        const questionSet = makeQuestionSet({
            questions: [makeQuestion({
                options: [{
                    id: 'opt-swimming', text: 'Swimming', order: 0,
                    items: [
                        makeItem('Beach umbrella', ['p1'], { communal: true }),
                        makeItem('Cooler', ['p1'], { communal: true }),
                    ],
                }],
            })],
        })
        const list = makeList({
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
            // Cooler was already deleted as a communal item (personId '')
            deletedItems: [listItem({ itemText: 'Cooler', personId: '', personName: '', communal: true })],
        })

        const additions = computeQuestionSetAdditions(list, questionSet)

        expect(additions.map(a => a.itemText)).toEqual(['Beach umbrella'])
        expect(additions[0].communal).toBe(true)
        expect(additions[0].personId).toBe('')
    })

    it('does not generate items for a person removed from the question set', () => {
        const questionSet = makeQuestionSet({
            people: [alice], // Bob removed
            questions: [makeQuestion({
                options: [{
                    id: 'opt-swimming', text: 'Swimming', order: 0,
                    items: [makeItem('Goggles', ['p1', 'p2'])],
                }],
            })],
        })
        const list = makeList({
            selectedPeopleIds: ['p1', 'p2'],
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
        })

        const additions = computeQuestionSetAdditions(list, questionSet)

        expect(additions.map(a => a.personName)).toEqual(['Alice'])
    })

    it('silently ignores answers pointing at deleted questions/options', () => {
        const questionSet = makeQuestionSet({ questions: [] })
        const list = makeList({
            questionAnswers: [{ questionId: 'q-gone', selectedOptionIds: ['opt-gone'] }],
        })

        expect(computeQuestionSetAdditions(list, questionSet)).toEqual([])
    })

    it('applies suggested quantities when nights is set', () => {
        const questionSet = makeQuestionSet({
            people: [alice],
            questions: [makeQuestion({
                options: [{
                    id: 'opt-swimming', text: 'Swimming', order: 0,
                    items: [makeItem('Socks', ['p1'], { perNight: 1 })],
                }],
            })],
        })
        const list = makeList({
            selectedPeopleIds: ['p1'],
            nights: 3,
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
        })

        const additions = computeQuestionSetAdditions(list, questionSet)

        expect(additions).toHaveLength(1)
        expect(additions[0].quantity).toBe(3)
    })

    it('adds new always-needed items', () => {
        const questionSet = makeQuestionSet({
            people: [alice],
            alwaysNeededItems: [makeItem('Passport', ['p1'])],
        })
        const list = makeList({ selectedPeopleIds: ['p1'] })

        const additions = computeQuestionSetAdditions(list, questionSet)

        expect(additions.map(a => a.itemText)).toEqual(['Passport'])
    })

    describe('legacy lists without stored generation inputs', () => {
        it('reconstructs answers and travellers from existing items', () => {
            const questionSet = makeQuestionSet({
                questions: [makeQuestion({
                    options: [{
                        id: 'opt-swimming', text: 'Swimming', order: 0,
                        items: [
                            makeItem('Swimsuit', ['p1']),
                            makeItem('Goggles', ['p1']), // the new item
                        ],
                    }],
                })],
            })
            // Legacy: no questionAnswers / selectedPeopleIds fields at all
            const list: PackingList = {
                id: 'list-1', name: 'Trip', createdAt: '2024-01-01T00:00:00.000Z',
                items: [listItem({ itemText: 'Swimsuit', personId: 'p1', personName: 'Alice', optionId: 'opt-swimming' })],
            }

            const additions = computeQuestionSetAdditions(list, questionSet)

            expect(additions.map(a => a.itemText)).toEqual(['Goggles'])
        })

        it('reconstructs travellers from deleted items too', () => {
            const questionSet = makeQuestionSet({
                questions: [makeQuestion({
                    options: [{
                        id: 'opt-swimming', text: 'Swimming', order: 0,
                        items: [makeItem('Goggles', ['p1'])],
                    }],
                })],
            })
            const list: PackingList = {
                id: 'list-1', name: 'Trip', createdAt: '2024-01-01T00:00:00.000Z',
                items: [],
                deletedItems: [listItem({ itemText: 'Swimsuit', personId: 'p1', personName: 'Alice', optionId: 'opt-swimming' })],
            }

            const additions = computeQuestionSetAdditions(list, questionSet)

            // Swimsuit was deleted so it's skipped; Goggles is new for reconstructed traveller p1
            expect(additions.map(a => a.itemText)).toEqual(['Goggles'])
        })
    })
})

describe('reconstructGenerationInputs', () => {
    it('derives distinct (question, option) answers and non-empty personIds', () => {
        const list: PackingList = {
            id: 'list-1', name: 'Trip', createdAt: '2024-01-01T00:00:00.000Z',
            items: [
                listItem({ questionId: 'q1', optionId: 'o1', personId: 'p1' }),
                listItem({ questionId: 'q1', optionId: 'o1', personId: 'p2' }),
                listItem({ questionId: 'q1', optionId: 'o2', personId: 'p1' }),
                listItem({ questionId: 'q2', optionId: 'o3', personId: 'p1' }),
            ],
        }

        const { questionAnswers, selectedPeopleIds } = reconstructGenerationInputs(list)

        expect(selectedPeopleIds.sort()).toEqual(['p1', 'p2'])
        const q1 = questionAnswers.find(a => a.questionId === 'q1')!
        expect(q1.selectedOptionIds.sort()).toEqual(['o1', 'o2'])
        expect(questionAnswers.find(a => a.questionId === 'q2')!.selectedOptionIds).toEqual(['o3'])
    })

    it('skips always-needed and custom items and empty personIds', () => {
        const list: PackingList = {
            id: 'list-1', name: 'Trip', createdAt: '2024-01-01T00:00:00.000Z',
            items: [
                listItem({ questionId: 'always-needed', optionId: 'always-needed', personId: 'p1' }),
                listItem({ questionId: '', optionId: '', personId: '' }),
            ],
        }

        const { questionAnswers, selectedPeopleIds } = reconstructGenerationInputs(list)

        expect(questionAnswers).toEqual([])
        // always-needed item still contributes its personId as a traveller
        expect(selectedPeopleIds).toEqual(['p1'])
    })
})
