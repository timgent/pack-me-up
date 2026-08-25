import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PouchDB from 'pouchdb'
import PouchDBMemoryAdapter from 'pouchdb-adapter-memory'
import { PackingAppDatabase } from '../services/database'
import {
    applyQuestionSetChanges,
    computeQuestionSetChanges,
    reconstructGenerationInputs,
    type QuestionSetChange,
} from './updateFromQuestions'
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

// A packing-list item generated from a question option. `category` matches what
// `defaultCategoryFor` gives a multiple-choice question — the option's text —
// so a fixture that hasn't moved sections doesn't look like it has.
function listItem(overrides: Partial<PackingListItem> = {}): PackingListItem {
    return {
        id: crypto.randomUUID(),
        itemText: 'Existing',
        personId: 'p1',
        personName: 'Alice',
        questionId: 'q-activities',
        optionId: 'opt-swimming',
        category: 'Swimming',
        packed: false,
        ...overrides,
    }
}

/** The one option most tests hang their items off. */
function swimming(items: Item[]) {
    return makeQuestionSet({
        questions: [makeQuestion({
            options: [{ id: 'opt-swimming', text: 'Swimming', order: 0, items }],
        })],
    })
}

const answeredSwimming = [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }]

const only = (changes: QuestionSetChange[], type: QuestionSetChange['type']) =>
    changes.filter(change => change.type === type)

/** The items a run of changes would append, which is what the old API returned. */
const additions = (changes: QuestionSetChange[]) =>
    only(changes, 'add').flatMap(change => change.additions)

describe('additions', () => {
    it('adds a new item in a selected option for each selected traveller', () => {
        const questionSet = swimming([makeItem('Goggles', ['p1', 'p2'])])
        const list = makeList({ questionAnswers: answeredSwimming })

        const added = additions(computeQuestionSetChanges(list, questionSet))

        expect(added.map(a => `${a.itemText}:${a.personName}`).sort())
            .toEqual(['Goggles:Alice', 'Goggles:Bob'])
        added.forEach(a => {
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
        const list = makeList({ questionAnswers: answeredSwimming })

        expect(additions(computeQuestionSetChanges(list, questionSet)).map(a => a.itemText)).toEqual(['Goggles'])
    })

    it('leaves alone an item already on the list, including a hand-added one with the same text', () => {
        const questionSet = swimming([makeItem('Goggles', ['p1'])])
        const list = makeList({
            questionAnswers: answeredSwimming,
            // custom item added by hand with no questionId but same text/person
            items: [listItem({ itemText: 'goggles', questionId: '', optionId: '', category: undefined })],
        })

        expect(computeQuestionSetChanges(list, questionSet)).toEqual([])
    })

    it('never resurrects an item the user previously deleted', () => {
        const questionSet = swimming([makeItem('Goggles', ['p1'])])
        const list = makeList({
            questionAnswers: answeredSwimming,
            deletedItems: [listItem({ itemText: 'Goggles' })],
        })

        expect(computeQuestionSetChanges(list, questionSet)).toEqual([])
    })

    it('respects communal trigger semantics and skips deleted communal items', () => {
        const questionSet = swimming([
            makeItem('Beach umbrella', ['p1'], { communal: true }),
            makeItem('Cooler', ['p1'], { communal: true }),
        ])
        const list = makeList({
            questionAnswers: answeredSwimming,
            // Cooler was already deleted as a communal item (personId '')
            deletedItems: [listItem({ itemText: 'Cooler', personId: '', personName: '', communal: true })],
        })

        const added = additions(computeQuestionSetChanges(list, questionSet))

        expect(added.map(a => a.itemText)).toEqual(['Beach umbrella'])
        expect(added[0].communal).toBe(true)
        expect(added[0].personId).toBe('')
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
        const list = makeList({ selectedPeopleIds: ['p1', 'p2'], questionAnswers: answeredSwimming })

        expect(additions(computeQuestionSetChanges(list, questionSet)).map(a => a.personName)).toEqual(['Alice'])
    })

    it('silently ignores answers pointing at deleted questions/options', () => {
        const questionSet = makeQuestionSet({ questions: [] })
        const list = makeList({
            questionAnswers: [{ questionId: 'q-gone', selectedOptionIds: ['opt-gone'] }],
        })

        expect(computeQuestionSetChanges(list, questionSet)).toEqual([])
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
        const list = makeList({ selectedPeopleIds: ['p1'], nights: 3, questionAnswers: answeredSwimming })

        const added = additions(computeQuestionSetChanges(list, questionSet))

        expect(added).toHaveLength(1)
        expect(added[0].quantity).toBe(3)
    })

    it('adds new always-needed items', () => {
        const questionSet = makeQuestionSet({ people: [alice], alwaysNeededItems: [makeItem('Passport', ['p1'])] })
        const list = makeList({ selectedPeopleIds: ['p1'] })

        expect(additions(computeQuestionSetChanges(list, questionSet)).map(a => a.itemText)).toEqual(['Passport'])
    })

    describe('legacy lists without stored generation inputs', () => {
        it('reconstructs answers and travellers from existing items', () => {
            const questionSet = swimming([
                makeItem('Swimsuit', ['p1']),
                makeItem('Goggles', ['p1']), // the new item
            ])
            // Legacy: no questionAnswers / selectedPeopleIds fields at all
            const list: PackingList = {
                id: 'list-1', name: 'Trip', createdAt: '2024-01-01T00:00:00.000Z',
                items: [listItem({ itemText: 'Swimsuit' })],
            }

            expect(additions(computeQuestionSetChanges(list, questionSet)).map(a => a.itemText)).toEqual(['Goggles'])
        })

        it('reconstructs travellers from deleted items too', () => {
            const questionSet = swimming([makeItem('Goggles', ['p1'])])
            const list: PackingList = {
                id: 'list-1', name: 'Trip', createdAt: '2024-01-01T00:00:00.000Z',
                items: [],
                deletedItems: [listItem({ itemText: 'Swimsuit' })],
            }

            const changes = computeQuestionSetChanges(list, questionSet)

            // Swimsuit was deleted so it's skipped; Goggles is new for reconstructed traveller p1
            expect(additions(changes).map(a => a.itemText)).toEqual(['Goggles'])
        })
    })
})

describe('removals', () => {
    it('offers an item the questions no longer produce', () => {
        const questionSet = swimming([makeItem('Goggles', ['p1'])])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            questionAnswers: answeredSwimming,
            items: [listItem({ itemText: 'Goggles' }), listItem({ id: 'snorkel', itemText: 'Snorkel' })],
        })

        const removals = only(computeQuestionSetChanges(list, questionSet), 'remove')

        expect(removals.map(change => change.itemText)).toEqual(['Snorkel'])
        expect(removals[0].removedIds).toEqual(['snorkel'])
        expect(removals[0].additions).toEqual([])
    })

    it('never offers to remove an item the user added by hand', () => {
        const questionSet = swimming([makeItem('Goggles', ['p1'])])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            questionAnswers: answeredSwimming,
            items: [
                listItem({ itemText: 'Goggles' }),
                listItem({ itemText: 'Book', questionId: '', optionId: '', category: undefined }),
            ],
        })

        expect(only(computeQuestionSetChanges(list, questionSet), 'remove')).toEqual([])
    })

    // The #260 shape: a list whose generation inputs went missing regenerates
    // nothing, and must not read that as "everything has gone".
    it('offers nothing when the list no longer remembers answering the question', () => {
        const questionSet = swimming([makeItem('Goggles', ['p1'])])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            questionAnswers: [],
            items: [listItem({ itemText: 'Goggles' })],
        })

        expect(only(computeQuestionSetChanges(list, questionSet), 'remove')).toEqual([])
    })

    it('leaves always-needed items alone when there is nobody left to generate them for', () => {
        const questionSet = makeQuestionSet({ people: [], alwaysNeededItems: [] })
        const list = makeList({
            selectedPeopleIds: [],
            items: [listItem({
                itemText: 'Passport', questionId: 'always-needed', optionId: 'always-needed', category: 'Essentials',
            })],
        })

        expect(computeQuestionSetChanges(list, questionSet)).toEqual([])
    })

    it('offers an always-needed item that has left the question set', () => {
        const questionSet = makeQuestionSet({ people: [alice], alwaysNeededItems: [makeItem('Passport', ['p1'])] })
        const list = makeList({
            selectedPeopleIds: ['p1'],
            items: [
                listItem({ itemText: 'Passport', questionId: 'always-needed', optionId: 'always-needed', category: 'Essentials' }),
                listItem({ itemText: 'Sun cream', questionId: 'always-needed', optionId: 'always-needed', category: 'Essentials' }),
            ],
        })

        expect(only(computeQuestionSetChanges(list, questionSet), 'remove').map(c => c.itemText)).toEqual(['Sun cream'])
    })
})

describe('updates', () => {
    it('pairs a renamed item with the one already on the list, keeping its id and packed state', () => {
        const questionSet = swimming([makeItem('Swimming goggles', ['p1'])])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            questionAnswers: answeredSwimming,
            items: [listItem({ id: 'goggles', itemText: 'Goggles', packed: true })],
        })

        const changes = computeQuestionSetChanges(list, questionSet)

        expect(changes).toHaveLength(1)
        expect(changes[0].type).toBe('update')
        expect(changes[0].itemText).toBe('Swimming goggles')
        expect(changes[0].detail).toContain('Renamed from “Goggles”')
        const [replacement] = changes[0].replacements
        expect(replacement.id).toBe('goggles')
        expect(replacement.packed).toBe(true)
        expect(replacement.itemText).toBe('Swimming goggles')
    })

    it('offers a section move', () => {
        const questionSet = swimming([makeItem('Goggles', ['p1'], { category: 'Beach kit' })])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            questionAnswers: answeredSwimming,
            items: [listItem({ itemText: 'Goggles' })],
        })

        const changes = computeQuestionSetChanges(list, questionSet)

        expect(changes).toHaveLength(1)
        expect(changes[0].detail).toBe('Moved to Beach kit')
        expect(changes[0].replacements[0].category).toBe('Beach kit')
    })

    it('offers a changed suggested quantity', () => {
        const questionSet = swimming([makeItem('Socks', ['p1'], { perNight: 2 })])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            nights: 3,
            questionAnswers: answeredSwimming,
            items: [listItem({ itemText: 'Socks', quantity: 3 })],
        })

        const changes = computeQuestionSetChanges(list, questionSet)

        expect(changes[0].detail).toBe('Now ×6 (was ×3)')
        expect(changes[0].replacements[0].quantity).toBe(6)
    })

    it('says nothing when the item is unchanged', () => {
        const questionSet = swimming([makeItem('Goggles', ['p1'])])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            questionAnswers: answeredSwimming,
            items: [listItem({ itemText: 'Goggles' })],
        })

        expect(computeQuestionSetChanges(list, questionSet)).toEqual([])
    })

    it('will not guess which of two renamed items is which', () => {
        const questionSet = swimming([makeItem('Swim goggles', ['p1']), makeItem('Swim cap', ['p1'])])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            questionAnswers: answeredSwimming,
            items: [listItem({ itemText: 'Goggles' }), listItem({ itemText: 'Cap' })],
        })

        const changes = computeQuestionSetChanges(list, questionSet)

        expect(only(changes, 'update')).toEqual([])
        expect(only(changes, 'add').map(c => c.itemText).sort()).toEqual(['Swim cap', 'Swim goggles'])
        expect(only(changes, 'remove').map(c => c.itemText).sort()).toEqual(['Cap', 'Goggles'])
    })

    // Deliberate, and the reason rename pairing only ever looks at items still
    // on the list: a tombstone says "not this, on this trip", and it is matched
    // by name. Deciding that a differently-named item is *really* the one that
    // was thrown away would mean silently withholding a genuine addition —
    // invisible to the user, where an addition they don't want is one untick
    // away.
    it('offers an item the user deleted and then renamed in their questions as a new item', () => {
        const questionSet = swimming([makeItem('Swimming goggles', ['p1'])])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            questionAnswers: answeredSwimming,
            deletedItems: [listItem({ itemText: 'Goggles' })],
        })

        const changes = computeQuestionSetChanges(list, questionSet)

        expect(changes.map(c => `${c.type}:${c.itemText}`)).toEqual(['add:Swimming goggles'])
    })

    // The product decision this flow turns on: a generated item the user has
    // renamed on the list is theirs. The question set is no longer allowed to
    // rename it back — and it must not turn up as a duplicate addition either.
    describe('an item the user renamed by hand', () => {
        const questionSet = swimming([makeItem('Goggles', ['p1'])])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            questionAnswers: answeredSwimming,
            items: [listItem({ itemText: 'Kids’ goggles', textEdited: true })],
        })

        it('is never renamed back, nor offered again as an addition', () => {
            expect(computeQuestionSetChanges(list, questionSet)).toEqual([])
        })

        it('still follows the question set into another section', () => {
            const moved = swimming([makeItem('Goggles', ['p1'], { category: 'Beach kit' })])

            const changes = computeQuestionSetChanges(list, moved)

            expect(changes).toHaveLength(1)
            expect(changes[0].detail).toBe('Moved to Beach kit')
            // Their name survives the section move
            expect(changes[0].replacements[0].itemText).toBe('Kids’ goggles')
        })

        it('is still offered for removal once it leaves the questions', () => {
            const gone = swimming([])

            const changes = computeQuestionSetChanges(list, gone)

            expect(changes.map(c => c.type)).toEqual(['remove'])
        })
    })

    it('leaves a hand-set quantity alone', () => {
        const questionSet = swimming([makeItem('Socks', ['p1'], { perNight: 2 })])
        const list = makeList({
            selectedPeopleIds: ['p1'],
            nights: 3,
            questionAnswers: answeredSwimming,
            items: [listItem({ itemText: 'Socks', quantity: 2, quantityEdited: true })],
        })

        expect(computeQuestionSetChanges(list, questionSet)).toEqual([])
    })
})

describe('items crossing the communal boundary', () => {
    it('replaces everybody’s own copy with one for the group', () => {
        const questionSet = swimming([makeItem('Cooler', ['p1', 'p2'], { communal: true })])
        const list = makeList({
            questionAnswers: answeredSwimming,
            items: [
                listItem({ id: 'cooler-a', itemText: 'Cooler', packed: true }),
                listItem({ id: 'cooler-b', itemText: 'Cooler', personId: 'p2', personName: 'Bob', packed: true }),
            ],
        })

        const changes = computeQuestionSetChanges(list, questionSet)

        expect(changes.map(c => c.type)).toEqual(['sharing'])
        expect(changes[0].removedIds.sort()).toEqual(['cooler-a', 'cooler-b'])
        expect(changes[0].additions).toHaveLength(1)
        expect(changes[0].additions[0].personId).toBe('')
        expect(changes[0].additions[0].communal).toBe(true)
        // Packed for everyone was packed, so the shared copy arrives packed
        expect(changes[0].additions[0].packed).toBe(true)
        expect(changes[0].detail).toContain('Now shared for everyone')
    })

    it('does not call it packed when only one person had packed theirs', () => {
        const questionSet = swimming([makeItem('Cooler', ['p1', 'p2'], { communal: true })])
        const list = makeList({
            questionAnswers: answeredSwimming,
            items: [
                listItem({ itemText: 'Cooler', packed: true }),
                listItem({ itemText: 'Cooler', personId: 'p2', personName: 'Bob', packed: false }),
            ],
        })

        expect(computeQuestionSetChanges(list, questionSet)[0].additions[0].packed).toBe(false)
    })

    it('replaces the group’s copy with one each', () => {
        const questionSet = swimming([makeItem('Towel', ['p1', 'p2'])])
        const list = makeList({
            questionAnswers: answeredSwimming,
            items: [listItem({ id: 'towel', itemText: 'Towel', personId: '', personName: '', communal: true, packed: true })],
        })

        const changes = computeQuestionSetChanges(list, questionSet)

        expect(changes.map(c => c.type)).toEqual(['sharing'])
        expect(changes[0].removedIds).toEqual(['towel'])
        expect(changes[0].additions.map(i => i.personName).sort()).toEqual(['Alice', 'Bob'])
        expect(changes[0].additions.every(i => i.packed)).toBe(true)
        expect(changes[0].detail).toContain('Now one each')
    })

    it('honours a deleted shared copy rather than reinstating it', () => {
        const questionSet = swimming([makeItem('Cooler', ['p1', 'p2'], { communal: true })])
        const list = makeList({
            questionAnswers: answeredSwimming,
            items: [listItem({ itemText: 'Cooler' }), listItem({ itemText: 'Cooler', personId: 'p2', personName: 'Bob' })],
            deletedItems: [listItem({ itemText: 'Cooler', personId: '', personName: '', communal: true })],
        })

        // Nothing at all: the shared copy stays deleted, and the personal copies
        // it would have replaced are not left looking like strays either.
        expect(computeQuestionSetChanges(list, questionSet)).toEqual([])
    })
})

describe('applyQuestionSetChanges', () => {
    it('adds, replaces and removes in a single pass', () => {
        const list = makeList({
            items: [
                listItem({ id: 'keep', itemText: 'Keep' }),
                listItem({ id: 'rename', itemText: 'Old', packed: true }),
                listItem({ id: 'drop', itemText: 'Drop' }),
            ],
        })
        const changes: QuestionSetChange[] = [
            {
                id: 'a', type: 'add', itemText: 'New', personName: 'Alice',
                additions: [listItem({ id: 'new', itemText: 'New' })], removedIds: [], replacements: [],
            },
            {
                id: 'u', type: 'update', itemText: 'New name', personName: 'Alice',
                additions: [], removedIds: [],
                replacements: [listItem({ id: 'rename', itemText: 'New name', packed: true })],
            },
            {
                id: 'r', type: 'remove', itemText: 'Drop', personName: 'Alice',
                additions: [], removedIds: ['drop'], replacements: [],
            },
        ]

        const updated = applyQuestionSetChanges(list, changes)

        expect(updated.items.map(i => `${i.id}:${i.itemText}`))
            .toEqual(['keep:Keep', 'rename:New name', 'new:New'])
        expect(updated.items.find(i => i.id === 'rename')!.packed).toBe(true)
        // A removal from this flow is not a deletion the user made, so it leaves
        // no tombstone to block the item coming back with its option.
        expect(updated.deletedItems).toBeUndefined()
    })

    it('leaves the list untouched when nothing is selected', () => {
        const list = makeList({ items: [listItem({ id: 'keep' })] })
        expect(applyQuestionSetChanges(list, []).items).toEqual(list.items)
    })
})

describe('with no question set on the device', () => {
    it('reports no changes rather than throwing', () => {
        const list = makeList({ items: [listItem({ itemText: 'Goggles' })] })
        expect(computeQuestionSetChanges(list, null)).toEqual([])
        expect(computeQuestionSetChanges(list, undefined)).toEqual([])
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
        items: [listItem({ itemText: 'Goggles' })],
    })

    it('uses the stored generation inputs and nights, not the reconstruction fallback', async () => {
        await db.savePackingList(savedList)
        const reloaded = await db.getPackingList(savedList.id)

        const added = additions(computeQuestionSetChanges(reloaded, questionSet))

        // Reconstruction cannot see 'opt-rainy' — no item on the list points at it.
        expect(added.map(a => a.itemText)).toEqual(['Socks'])
        // 1 per night × 3 nights, from the stored `nights`.
        expect(added[0].quantity).toBe(3)
    })

    it('adds nothing when the generation inputs are missing (the pre-fix behaviour)', () => {
        const withoutStoredInputs: PackingList = {
            ...savedList,
            nights: undefined,
            questionAnswers: undefined,
            selectedPeopleIds: undefined,
        }

        expect(additions(computeQuestionSetChanges(withoutStoredInputs, questionSet))).toEqual([])
    })

    it('keeps a hand-edited name and amount through the local database', async () => {
        const edited = makeList({
            id: 'list-edited',
            selectedPeopleIds: ['p1'],
            questionAnswers: [{ questionId: 'q-activities', selectedOptionIds: ['opt-swimming'] }],
            items: [listItem({ itemText: 'Kids’ goggles', textEdited: true, quantity: 2, quantityEdited: true })],
        })
        await db.savePackingList(edited)
        const reloaded = await db.getPackingList(edited.id)

        expect(reloaded.items[0].textEdited).toBe(true)
        expect(reloaded.items[0].quantityEdited).toBe(true)
        expect(computeQuestionSetChanges(reloaded, questionSet)).toEqual([])
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
        expect(additions(computeQuestionSetChanges(list, questionSet)).filter(i => i.itemText === 'Towels')).toHaveLength(1)
    })

    it('offers the larger of the two suggested quantities', () => {
        const [towels] = additions(computeQuestionSetChanges(list, questionSet))
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
        const list = makeList({ questionAnswers: answeredSwimming })
        expect(additions(computeQuestionSetChanges(list, questionSet))).toHaveLength(0)
    })

    it('skips a deleted item inside a live option', () => {
        const questionSet = swimming([
            makeItem('Goggles', ['p1']),
            makeItem('Wetsuit', ['p1'], { deletedAt: DELETED }),
        ])
        const list = makeList({ questionAnswers: answeredSwimming })
        expect(additions(computeQuestionSetChanges(list, questionSet)).map(i => i.itemText)).toEqual(['Goggles'])
    })

    it('skips a deleted always-needed item', () => {
        const questionSet = makeQuestionSet({
            alwaysNeededItems: [
                makeItem('Passport', ['p1']),
                makeItem('Sun cream', ['p1'], { deletedAt: DELETED }),
            ],
        })
        expect(additions(computeQuestionSetChanges(makeList(), questionSet)).map(i => i.itemText)).toEqual(['Passport'])
    })

    it('packs nothing for a traveller who has been deleted', () => {
        const questionSet = makeQuestionSet({
            people: [alice, { ...bob, deletedAt: DELETED }],
            alwaysNeededItems: [makeItem('Passport', ['p1', 'p2'])],
        })
        expect(additions(computeQuestionSetChanges(makeList(), questionSet)).map(i => i.personId)).toEqual(['p1'])
    })
})
