import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PouchDB from 'pouchdb'
import PouchDBMemoryAdapter from 'pouchdb-adapter-memory'
import { PackingAppDatabase } from '../services/database'
import { computeQuestionSetAdditions, reconstructGenerationInputs } from './updateFromQuestions'
import { PackingList, PackingListItem } from './types'
import { PackingListQuestionSet, Question, Person, Item } from '../edit-questions/types'

PouchDB.plugin(PouchDBMemoryAdapter)

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

// End-to-end guard for #260: the generation inputs were persisted by the
// creation flow but stripped by savePackingList, so "Update from questions"
// always fell back to reconstructing them from the list's items — missing
// additions for options that had generated nothing, and losing the per-night
// quantities that `nights` drives.
describe('after a save/load round-trip through the local database', () => {
    let db: PackingAppDatabase

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        // @ts-expect-error - Accessing private static property for testing
        const instances = PackingAppDatabase.instances as Map<string, PackingAppDatabase>
        for (const instance of instances.values()) {
            // @ts-expect-error - Accessing private property for testing
            await instance.db.destroy()
        }
        instances.clear()
        db = PackingAppDatabase.getInstance('update-from-questions')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    // 'opt-rainy' was answered at creation time but had no items then, so it
    // leaves no trace in the list's items: only the stored questionAnswers can
    // reveal it.
    const questionSet = makeQuestionSet({
        questions: [makeQuestion({
            options: [
                { id: 'opt-swimming', text: 'Swimming', order: 0, items: [makeItem('Goggles', ['p1'])] },
                { id: 'opt-rainy', text: 'Rainy', order: 1, items: [makeItem('Socks', ['p1'], { perNight: 1 })] },
            ],
        })],
    })

    const savedList: PackingList = makeList({
        nights: 3,
        selectedPeopleIds: ['p1'],
        questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming', 'opt-rainy'] }],
        items: [listItem({ itemText: 'Goggles', personId: 'p1', optionId: 'opt-swimming' })],
    })

    it('uses the stored generation inputs and nights, not the reconstruction fallback', async () => {
        await db.savePackingList(savedList)
        const reloaded = await db.getPackingList(savedList.id)

        const additions = computeQuestionSetAdditions(reloaded, questionSet)

        // Reconstruction cannot see 'opt-rainy' — no item on the list points at it.
        expect(additions.map(a => a.itemText)).toEqual(['Socks'])
        // 1 per night × 3 nights, from the stored `nights`.
        expect(additions[0].quantity).toBe(3)
    })

    it('finds nothing when the generation inputs are missing (the pre-fix behaviour)', () => {
        const withoutStoredInputs: PackingList = {
            ...savedList,
            nights: undefined,
            questionAnswers: undefined,
            selectedPeopleIds: undefined,
        }

        expect(computeQuestionSetAdditions(withoutStoredInputs, questionSet)).toEqual([])
    })
})

describe('an item reaching one person from two answers', () => {
    // Same collapsing as list creation, so updating never suggests the same
    // thing twice — nor the smaller of two suggested amounts.
    const twoOptions = makeQuestion({
        options: [
            { id: 'o1', text: 'Self-catering', order: 0, items: [makeItem('Towels', ['p1'])] },
            { id: 'o2', text: 'Camping', order: 1, items: [makeItem('Towels', ['p1'], { perNight: 1, perNights: 2 })] },
        ],
    })
    const questionSet = makeQuestionSet({ questions: [twoOptions] })
    const list = makeList({
        nights: 6,
        selectedPeopleIds: ['p1'],
        questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['o1', 'o2'] }],
    })

    it('offers it once, not once per answer', () => {
        const additions = computeQuestionSetAdditions(list, questionSet)
        expect(additions.filter(i => i.itemText === 'Towels')).toHaveLength(1)
    })

    it('offers the larger of the two suggested quantities', () => {
        const [towels] = computeQuestionSetAdditions(list, questionSet)
        expect(towels.quantity).toBe(3)
    })
})

describe('entities the user has deleted from the question set', () => {
    const DELETED = '2026-01-01T00:00:00.000Z'

    it('adds nothing for a question that has been deleted', () => {
        const questionSet = makeQuestionSet({
            questions: [makeQuestion({
                deletedAt: DELETED,
                options: [{
                    id: 'opt-swimming', text: 'Swimming', order: 0,
                    items: [makeItem('Goggles', ['p1'])],
                }],
            })],
        })
        const list = makeList({
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
        })
        expect(computeQuestionSetAdditions(list, questionSet)).toHaveLength(0)
    })

    it('skips a deleted item inside a live option', () => {
        const questionSet = makeQuestionSet({
            questions: [makeQuestion({
                options: [{
                    id: 'opt-swimming', text: 'Swimming', order: 0,
                    items: [
                        makeItem('Goggles', ['p1']),
                        makeItem('Wetsuit', ['p1'], { deletedAt: DELETED }),
                    ],
                }],
            })],
        })
        const list = makeList({
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
        })
        expect(computeQuestionSetAdditions(list, questionSet).map(i => i.itemText)).toEqual(['Goggles'])
    })

    it('skips a deleted always-needed item', () => {
        const questionSet = makeQuestionSet({
            alwaysNeededItems: [
                makeItem('Passport', ['p1']),
                makeItem('Sun cream', ['p1'], { deletedAt: DELETED }),
            ],
        })
        expect(computeQuestionSetAdditions(makeList(), questionSet).map(i => i.itemText)).toEqual(['Passport'])
    })

    it('packs nothing for a traveller who has been deleted', () => {
        const questionSet = makeQuestionSet({
            people: [alice, { ...bob, deletedAt: DELETED }],
            alwaysNeededItems: [makeItem('Passport', ['p1', 'p2'])],
        })
        const additions = computeQuestionSetAdditions(makeList(), questionSet)
        expect(additions.map(i => i.personId)).toEqual(['p1'])
    })
})
