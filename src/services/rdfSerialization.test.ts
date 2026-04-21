import { describe, it, expect } from 'vitest'
import type { SolidDataset } from '@inrupt/solid-client'
import {
    packingListToDataset,
    datasetToPackingList,
    questionSetToDataset,
    datasetToQuestionSet,
} from './rdfSerialization'
import type { PackingList, PackingListItem } from '../create-packing-list/types'
import type { PackingListQuestionSet, Person, Question, Option } from '../edit-questions/types'

const DATASET_URL = 'https://pod.example.com/pack-me-up/packing-lists/list-abc.ttl'
const QS_DATASET_URL = 'https://pod.example.com/pack-me-up/packing-list-questions.ttl'

// ── PackingList helpers ───────────────────────────────────────────────────────

function makeItem(overrides: Partial<PackingListItem> = {}): PackingListItem {
    return {
        id: 'item-1',
        itemText: 'Passport',
        personId: 'person-1',
        personName: 'Alice',
        questionId: 'q-1',
        optionId: 'opt-1',
        packed: false,
        ...overrides,
    }
}

function makePackingList(overrides: Partial<PackingList> = {}): PackingList {
    return {
        id: 'list-abc',
        name: 'Camping Trip',
        createdAt: '2024-01-01T00:00:00.000Z',
        items: [],
        ...overrides,
    }
}

// ── QuestionSet helpers ───────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> = {}): Person {
    return { id: 'person-1', name: 'Alice', ...overrides }
}

function makeOption(overrides: Partial<Option> = {}): Option {
    return { id: 'opt-1', text: 'Yes', order: 0, items: [], ...overrides }
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
    return {
        id: 'q-1',
        type: 'saved',
        text: 'Traveling with a baby?',
        order: 0,
        options: [],
        ...overrides,
    }
}

function makeQuestionSet(overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet {
    return { _id: '1', people: [], alwaysNeededItems: [], questions: [], ...overrides }
}

function roundTripList(list: PackingList): PackingList {
    return datasetToPackingList(packingListToDataset(list, DATASET_URL), DATASET_URL)
}

function roundTripQs(qs: PackingListQuestionSet): PackingListQuestionSet {
    return datasetToQuestionSet(questionSetToDataset(qs, QS_DATASET_URL) as SolidDataset, QS_DATASET_URL)
}

// ── PackingList round-trip ────────────────────────────────────────────────────

describe('packingListToDataset / datasetToPackingList', () => {
    it('round-trips id, name, and createdAt', () => {
        const result = roundTripList(makePackingList())
        expect(result.id).toBe('list-abc')
        expect(result.name).toBe('Camping Trip')
        expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
        expect(result.items).toEqual([])
        expect(result.deletedItems).toEqual([])
    })

    it('round-trips lastModified', () => {
        const result = roundTripList(makePackingList({ lastModified: '2024-06-01T12:00:00.000Z' }))
        expect(result.lastModified).toBe('2024-06-01T12:00:00.000Z')
    })

    it('omits lastModified when not set', () => {
        const result = roundTripList(makePackingList())
        expect(result.lastModified).toBeUndefined()
    })

    it('does NOT store _rev', () => {
        const result = roundTripList(makePackingList({ _rev: '1-abc' }))
        expect(result._rev).toBeUndefined()
    })

    it('round-trips an item with all fields', () => {
        const item = makeItem({ packed: true, category: 'Documents', reviewed: true })
        const result = roundTripList(makePackingList({ items: [item] }))

        expect(result.items).toHaveLength(1)
        const r = result.items[0]
        expect(r.id).toBe('item-1')
        expect(r.itemText).toBe('Passport')
        expect(r.personId).toBe('person-1')
        expect(r.personName).toBe('Alice')
        expect(r.questionId).toBe('q-1')
        expect(r.optionId).toBe('opt-1')
        expect(r.packed).toBe(true)
        expect(r.category).toBe('Documents')
        expect(r.reviewed).toBe(true)
    })

    it('round-trips item with packed=false', () => {
        const result = roundTripList(makePackingList({ items: [makeItem({ packed: false })] }))
        expect(result.items[0].packed).toBe(false)
    })

    it('omits optional item fields when not set', () => {
        const result = roundTripList(makePackingList({ items: [makeItem()] }))
        expect(result.items[0].category).toBeUndefined()
        expect(result.items[0].reviewed).toBeUndefined()
    })

    it('round-trips multiple items', () => {
        const items = [
            makeItem({ id: 'item-1', itemText: 'Passport' }),
            makeItem({ id: 'item-2', itemText: 'Sunscreen' }),
            makeItem({ id: 'item-3', itemText: 'Camera' }),
        ]
        const result = roundTripList(makePackingList({ items }))
        expect(result.items).toHaveLength(3)
        const texts = result.items.map(i => i.itemText)
        expect(texts).toContain('Passport')
        expect(texts).toContain('Sunscreen')
        expect(texts).toContain('Camera')
    })

    it('round-trips deletedItems', () => {
        const deleted = makeItem({ id: 'item-del', itemText: 'Old item' })
        const result = roundTripList(makePackingList({ deletedItems: [deleted] }))
        expect(result.deletedItems).toHaveLength(1)
        expect(result.deletedItems![0].itemText).toBe('Old item')
    })

    it('returns empty deletedItems when not set', () => {
        const result = roundTripList(makePackingList())
        expect(result.deletedItems).toEqual([])
    })
})

// ── QuestionSet round-trip ────────────────────────────────────────────────────

describe('questionSetToDataset / datasetToQuestionSet', () => {
    it('round-trips a minimal question set', () => {
        const result = roundTripQs(makeQuestionSet())
        expect(result.people).toEqual([])
        expect(result.alwaysNeededItems).toEqual([])
        expect(result.questions).toEqual([])
    })

    it('round-trips lastModified', () => {
        const result = roundTripQs(makeQuestionSet({ lastModified: '2024-06-01T12:00:00.000Z' }))
        expect(result.lastModified).toBe('2024-06-01T12:00:00.000Z')
    })

    it('omits lastModified when not set', () => {
        const result = roundTripQs(makeQuestionSet())
        expect(result.lastModified).toBeUndefined()
    })

    it('does NOT store _rev', () => {
        const result = roundTripQs(makeQuestionSet({ _rev: '1-xyz' } as PackingListQuestionSet))
        expect(result._rev).toBeUndefined()
    })

    it('round-trips a person with all fields', () => {
        const result = roundTripQs(makeQuestionSet({ people: [makePerson({ ageRange: 'Adult', gender: 'female' })] }))
        expect(result.people).toHaveLength(1)
        const p = result.people[0]
        expect(p.id).toBe('person-1')
        expect(p.name).toBe('Alice')
        expect(p.ageRange).toBe('Adult')
        expect(p.gender).toBe('female')
    })

    it('omits optional person fields when not set', () => {
        const result = roundTripQs(makeQuestionSet({ people: [makePerson()] }))
        expect(result.people[0].ageRange).toBeUndefined()
        expect(result.people[0].gender).toBeUndefined()
    })

    it('round-trips multiple people', () => {
        const people = [makePerson({ id: 'p1', name: 'Alice' }), makePerson({ id: 'p2', name: 'Bob' })]
        const result = roundTripQs(makeQuestionSet({ people }))
        expect(result.people).toHaveLength(2)
        const names = result.people.map(p => p.name)
        expect(names).toContain('Alice')
        expect(names).toContain('Bob')
    })

    it('round-trips alwaysNeededItems with personSelections', () => {
        const qs = makeQuestionSet({
            alwaysNeededItems: [{
                text: 'Toothbrush',
                personSelections: [
                    { personId: 'p1', selected: true },
                    { personId: 'p2', selected: false },
                ],
            }],
        })
        const result = roundTripQs(qs)
        expect(result.alwaysNeededItems).toHaveLength(1)
        const item = result.alwaysNeededItems[0]
        expect(item.text).toBe('Toothbrush')
        expect(item.personSelections).toHaveLength(2)
        const ps1 = item.personSelections.find(ps => ps.personId === 'p1')!
        const ps2 = item.personSelections.find(ps => ps.personId === 'p2')!
        expect(ps1.selected).toBe(true)
        expect(ps2.selected).toBe(false)
    })

    it('round-trips a saved question with option and items', () => {
        const option = makeOption({
            items: [{ text: 'Nappies', personSelections: [{ personId: 'p1', selected: true }] }],
        })
        const question = makeQuestion({ type: 'saved', options: [option], questionType: 'single-choice' })
        const result = roundTripQs(makeQuestionSet({ questions: [question] }))

        expect(result.questions).toHaveLength(1)
        const q = result.questions[0]
        expect(q.id).toBe('q-1')
        expect(q.text).toBe('Traveling with a baby?')
        expect(q.type).toBe('saved')
        expect(q.order).toBe(0)
        expect(q.questionType).toBe('single-choice')

        expect(q.options).toHaveLength(1)
        const opt = q.options[0]
        expect(opt.id).toBe('opt-1')
        expect(opt.text).toBe('Yes')
        expect(opt.order).toBe(0)

        expect(opt.items).toHaveLength(1)
        expect(opt.items[0].text).toBe('Nappies')
        expect(opt.items[0].personSelections[0].personId).toBe('p1')
        expect(opt.items[0].personSelections[0].selected).toBe(true)
    })

    it('round-trips a draft question', () => {
        const result = roundTripQs(makeQuestionSet({ questions: [makeQuestion({ type: 'draft' })] }))
        expect(result.questions[0].type).toBe('draft')
    })

    it('round-trips multiple-choice questionType', () => {
        const result = roundTripQs(makeQuestionSet({ questions: [makeQuestion({ questionType: 'multiple-choice' })] }))
        expect(result.questions[0].questionType).toBe('multiple-choice')
    })

    it('preserves question order values', () => {
        const questions = [
            makeQuestion({ id: 'q1', text: 'First', order: 0 }),
            makeQuestion({ id: 'q2', text: 'Second', order: 1 }),
            makeQuestion({ id: 'q3', text: 'Third', order: 2 }),
        ]
        const result = roundTripQs(makeQuestionSet({ questions }))
        expect(result.questions).toHaveLength(3)
        const byId = Object.fromEntries(result.questions.map(q => [q.id, q]))
        expect(byId['q1'].order).toBe(0)
        expect(byId['q2'].order).toBe(1)
        expect(byId['q3'].order).toBe(2)
    })

    it('preserves option order values', () => {
        const options = [
            makeOption({ id: 'opt-a', text: 'Option A', order: 0 }),
            makeOption({ id: 'opt-b', text: 'Option B', order: 1 }),
        ]
        const result = roundTripQs(makeQuestionSet({ questions: [makeQuestion({ options })] }))
        const byId = Object.fromEntries(result.questions[0].options.map(o => [o.id, o]))
        expect(byId['opt-a'].order).toBe(0)
        expect(byId['opt-b'].order).toBe(1)
    })

    it('round-trips multiple options each with multiple items', () => {
        const opt1 = makeOption({
            id: 'opt-yes',
            text: 'Yes',
            items: [
                { text: 'Item A', personSelections: [] },
                { text: 'Item B', personSelections: [] },
            ],
        })
        const opt2 = makeOption({
            id: 'opt-no',
            text: 'No',
            items: [{ text: 'Item C', personSelections: [] }],
        })
        const result = roundTripQs(makeQuestionSet({ questions: [makeQuestion({ options: [opt1, opt2] })] }))
        const q = result.questions[0]
        const resOpt1 = q.options.find(o => o.id === 'opt-yes')!
        const resOpt2 = q.options.find(o => o.id === 'opt-no')!
        expect(resOpt1.items).toHaveLength(2)
        expect(resOpt2.items).toHaveLength(1)
        const texts1 = resOpt1.items.map(i => i.text)
        expect(texts1).toContain('Item A')
        expect(texts1).toContain('Item B')
        expect(resOpt2.items[0].text).toBe('Item C')
    })
})
