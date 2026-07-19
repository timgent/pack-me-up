import { describe, it, expect } from 'vitest'
import type { SolidDataset } from '@inrupt/solid-client'
import {
    packingListToDataset,
    datasetToPackingList,
    questionSetToDataset,
    datasetToQuestionSet,
    sharedListsWithMeToDataset,
    datasetToSharedListsWithMe,
} from './rdfSerialization'
import type { PackingList, PackingListItem } from '../create-packing-list/types'
import type { PackingListQuestionSet, Person, Question, Option } from '../edit-questions/types'
import type { SharedListsWithMe } from './rdfSerialization'

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
        expect(result.items[0].communal).toBeUndefined()
    })

    it('round-trips a communal item', () => {
        const item = makeItem({ communal: true, personId: '', personName: '' })
        const result = roundTripList(makePackingList({ items: [item] }))
        expect(result.items[0].communal).toBe(true)
        expect(result.items[0].personId).toBe('')
        expect(result.items[0].personName).toBe('')
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

    it('round-trips item lastModified', () => {
        const item = makeItem({ lastModified: '2024-06-01T12:00:00.000Z' })
        const result = roundTripList(makePackingList({ items: [item] }))
        expect(result.items[0].lastModified).toBe('2024-06-01T12:00:00.000Z')
    })

    it('omits item lastModified when not set', () => {
        const result = roundTripList(makePackingList({ items: [makeItem()] }))
        expect(result.items[0].lastModified).toBeUndefined()
    })

    it('round-trips deletedItem lastModified', () => {
        const deleted = makeItem({ id: 'item-del', lastModified: '2024-05-01T00:00:00.000Z' })
        const result = roundTripList(makePackingList({ deletedItems: [deleted] }))
        expect(result.deletedItems![0].lastModified).toBe('2024-05-01T00:00:00.000Z')
    })

    it('round-trips nights and omits it when not set', () => {
        expect(roundTripList(makePackingList({ nights: 3 })).nights).toBe(3)
        expect(roundTripList(makePackingList()).nights).toBeUndefined()
    })

    it('round-trips item quantity and omits it when not set', () => {
        const result = roundTripList(makePackingList({ items: [makeItem({ quantity: 4 })] }))
        expect(result.items[0].quantity).toBe(4)
        const without = roundTripList(makePackingList({ items: [makeItem()] }))
        expect(without.items[0].quantity).toBeUndefined()
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

    it('round-trips a communal always-needed item and omits the flag otherwise', () => {
        const qs = makeQuestionSet({
            alwaysNeededItems: [
                { text: 'First aid kit', communal: true, personSelections: [{ personId: 'p1', selected: true }] },
                { text: 'Toothbrush', personSelections: [{ personId: 'p1', selected: true }] },
            ],
        })
        const result = roundTripQs(qs)
        expect(result.alwaysNeededItems[0].communal).toBe(true)
        expect(result.alwaysNeededItems[1].communal).toBeUndefined()
    })

    it('round-trips a communal item inside a question option', () => {
        const option = makeOption({
            items: [{ text: 'Tent', communal: true, personSelections: [{ personId: 'p1', selected: true }] }],
        })
        const question = makeQuestion({ options: [option] })
        const result = roundTripQs(makeQuestionSet({ questions: [question] }))
        expect(result.questions[0].options[0].items[0].communal).toBe(true)
    })

    it('round-trips perNight and maxQuantity on items, omitting them when not set', () => {
        const option = makeOption({
            items: [
                { text: 'Socks', perNight: 1, personSelections: [{ personId: 'p1', selected: true }] },
                { text: 'Pyjamas', perNight: 1, maxQuantity: 2, personSelections: [{ personId: 'p1', selected: true }] },
                { text: 'Toothbrush', personSelections: [{ personId: 'p1', selected: true }] },
            ],
        })
        const question = makeQuestion({ options: [option] })
        const qs = makeQuestionSet({
            questions: [question],
            alwaysNeededItems: [{ text: 'Underwear', perNight: 2, personSelections: [{ personId: 'p1', selected: true }] }],
        })
        const result = roundTripQs(qs)
        const items = result.questions[0].options[0].items
        expect(items[0].perNight).toBe(1)
        expect(items[0].maxQuantity).toBeUndefined()
        expect(items[1].perNight).toBe(1)
        expect(items[1].maxQuantity).toBe(2)
        expect(items[2].perNight).toBeUndefined()
        expect(items[2].maxQuantity).toBeUndefined()
        expect(result.alwaysNeededItems[0].perNight).toBe(2)
    })

    it('round-trips fractional perNight rates', () => {
        const qs = makeQuestionSet({
            alwaysNeededItems: [{ text: 'Jumper', perNight: 0.25, personSelections: [{ personId: 'p1', selected: true }] }],
        })
        expect(roundTripQs(qs).alwaysNeededItems[0].perNight).toBe(0.25)
    })

    it('round-trips perNights and omits it when not set', () => {
        const qs = makeQuestionSet({
            alwaysNeededItems: [
                { text: 'Jumper', perNight: 1, perNights: 4, personSelections: [{ personId: 'p1', selected: true }] },
                { text: 'Socks', perNight: 1, personSelections: [{ personId: 'p1', selected: true }] },
            ],
        })
        const result = roundTripQs(qs)
        expect(result.alwaysNeededItems[0].perNights).toBe(4)
        expect(result.alwaysNeededItems[1].perNights).toBeUndefined()
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

// ── SharedListsWithMe round-trip ──────────────────────────────────────────────

const SLW_DATASET_URL = 'https://pod.example.com/pack-me-up/shared-lists-with-me.ttl'

function makeSharedListsWithMe(overrides: Partial<SharedListsWithMe> = {}): SharedListsWithMe {
    return {
        lists: [],
        lastModified: '2026-01-01T00:00:00.000Z',
        ...overrides,
    }
}

function roundTripSlwm(data: SharedListsWithMe): SharedListsWithMe {
    return datasetToSharedListsWithMe(sharedListsWithMeToDataset(data, SLW_DATASET_URL), SLW_DATASET_URL)
}

describe('sharedListsWithMeToDataset / datasetToSharedListsWithMe', () => {
    it('round-trips an empty list', () => {
        const result = roundTripSlwm(makeSharedListsWithMe())
        expect(result.lists).toHaveLength(0)
        expect(result.lastModified).toBe('2026-01-01T00:00:00.000Z')
    })

    it('round-trips a single shared list with all required fields', () => {
        const data = makeSharedListsWithMe({
            lists: [{
                listId: 'list-abc',
                listUrl: 'https://alice.solidcommunity.net/pack-me-up/packing-lists/list-abc.ttl',
                podUrl: 'https://alice.solidcommunity.net/',
                addedAt: '2026-02-01T12:00:00.000Z',
            }],
        })
        const result = roundTripSlwm(data)
        expect(result.lists).toHaveLength(1)
        expect(result.lists[0].listId).toBe('list-abc')
        expect(result.lists[0].listUrl).toBe('https://alice.solidcommunity.net/pack-me-up/packing-lists/list-abc.ttl')
        expect(result.lists[0].podUrl).toBe('https://alice.solidcommunity.net/')
        expect(result.lists[0].addedAt).toBe('2026-02-01T12:00:00.000Z')
    })

    it('round-trips optional ownerWebId and label', () => {
        const data = makeSharedListsWithMe({
            lists: [{
                listId: 'list-xyz',
                listUrl: 'https://alice.solidcommunity.net/pack-me-up/packing-lists/list-xyz.ttl',
                podUrl: 'https://alice.solidcommunity.net/',
                ownerWebId: 'https://alice.solidcommunity.net/profile/card#me',
                label: 'Summer Trip',
                addedAt: '2026-03-01T00:00:00.000Z',
            }],
        })
        const result = roundTripSlwm(data)
        expect(result.lists[0].ownerWebId).toBe('https://alice.solidcommunity.net/profile/card#me')
        expect(result.lists[0].label).toBe('Summer Trip')
    })

    it('round-trips multiple shared lists preserving all entries', () => {
        const data = makeSharedListsWithMe({
            lists: [
                { listId: 'list-1', listUrl: 'https://a.example/l/1.ttl', podUrl: 'https://a.example/', addedAt: '2026-01-01T00:00:00.000Z' },
                { listId: 'list-2', listUrl: 'https://b.example/l/2.ttl', podUrl: 'https://b.example/', addedAt: '2026-01-02T00:00:00.000Z' },
            ],
        })
        const result = roundTripSlwm(data)
        expect(result.lists).toHaveLength(2)
        const ids = result.lists.map(l => l.listId)
        expect(ids).toContain('list-1')
        expect(ids).toContain('list-2')
    })

    it('omits ownerWebId and label when not set', () => {
        const data = makeSharedListsWithMe({
            lists: [{ listId: 'l', listUrl: 'https://x.example/l.ttl', podUrl: 'https://x.example/', addedAt: '2026-01-01T00:00:00.000Z' }],
        })
        const result = roundTripSlwm(data)
        expect(result.lists[0].ownerWebId).toBeUndefined()
        expect(result.lists[0].label).toBeUndefined()
    })
})

describe('questionSet dateOfBirth and ageRanges round-trip', () => {
    it('round-trips a person dateOfBirth and omits it when not set', () => {
        const people = [
            makePerson({ id: 'p1', name: 'Neve', dateOfBirth: '2023-06-01' }),
            makePerson({ id: 'p2', name: 'Mum' }),
        ]
        const result = roundTripQs(makeQuestionSet({ people }))
        expect(result.people.find(p => p.name === 'Neve')!.dateOfBirth).toBe('2023-06-01')
        expect(result.people.find(p => p.name === 'Mum')!.dateOfBirth).toBeUndefined()
    })

    it('round-trips item ageRanges in canonical bracket order', () => {
        const qs = makeQuestionSet({
            alwaysNeededItems: [{
                text: 'Swimsuit',
                ageRanges: ['Adult', 'Toddler', 'Child', 'Teenager'],
                personSelections: [{ personId: 'p1', selected: true }],
            }],
        })
        const result = roundTripQs(qs)
        expect(result.alwaysNeededItems[0].ageRanges).toEqual(['Toddler', 'Child', 'Teenager', 'Adult'])
    })

    it('omits ageRanges when not set and round-trips it inside a question option', () => {
        const option = makeOption({
            items: [
                { text: 'Nappies', ageRanges: ['Baby'], personSelections: [{ personId: 'p1', selected: true }] },
                { text: 'Snacks', personSelections: [{ personId: 'p1', selected: true }] },
            ],
        })
        const question = makeQuestion({ options: [option] })
        const result = roundTripQs(makeQuestionSet({ questions: [question] }))
        expect(result.questions[0].options[0].items[0].ageRanges).toEqual(['Baby'])
        expect(result.questions[0].options[0].items[1].ageRanges).toBeUndefined()
    })
})

describe('item order round-trip', () => {
    function roundTripQS(qs: PackingListQuestionSet): PackingListQuestionSet {
        return datasetToQuestionSet(questionSetToDataset(qs, QS_DATASET_URL), QS_DATASET_URL)
    }

    it('round-trips order on option items and sorts by it on read', () => {
        const qs = makeQuestionSet({
            questions: [makeQuestion({
                options: [makeOption({
                    items: [
                        { id: 'i-b', text: 'B item', personSelections: [], order: 1 },
                        { id: 'i-a', text: 'A item', personSelections: [], order: 0 },
                    ],
                })],
            })],
        })
        const result = roundTripQS(qs)
        const items = result.questions[0].options[0].items
        expect(items.map(i => i.text)).toEqual(['A item', 'B item'])
        expect(items.map(i => i.order)).toEqual([0, 1])
    })

    it('round-trips order on alwaysNeededItems and sorts by it on read', () => {
        const qs = makeQuestionSet({
            alwaysNeededItems: [
                { id: 'i-b', text: 'Torch', personSelections: [], order: 1 },
                { id: 'i-a', text: 'Map', personSelections: [], order: 0 },
            ],
        })
        const result = roundTripQS(qs)
        expect(result.alwaysNeededItems.map(i => i.text)).toEqual(['Map', 'Torch'])
        expect(result.alwaysNeededItems.map(i => i.order)).toEqual([0, 1])
    })

    it('leaves order undefined for legacy items and keeps array order', () => {
        const qs = makeQuestionSet({
            alwaysNeededItems: [
                { id: 'i-b', text: 'Torch', personSelections: [] },
                { id: 'i-a', text: 'Map', personSelections: [] },
            ],
        })
        const result = roundTripQS(qs)
        expect(result.alwaysNeededItems.map(i => i.text)).toEqual(['Torch', 'Map'])
        expect(result.alwaysNeededItems.every(i => i.order === undefined)).toBe(true)
    })

    it('round-trips order on packing list items', () => {
        const list = makePackingList({
            items: [
                makeItem({ id: 'item-1', itemText: 'Passport', order: 0 }),
                makeItem({ id: 'item-2', itemText: 'Sunscreen', order: 1 }),
            ],
        })
        const result = roundTripList(list)
        const byId = new Map(result.items.map(i => [i.id, i]))
        expect(byId.get('item-1')?.order).toBe(0)
        expect(byId.get('item-2')?.order).toBe(1)
    })

    it('leaves order undefined for legacy packing list items', () => {
        const list = makePackingList({ items: [makeItem({ id: 'item-1' })] })
        const result = roundTripList(list)
        expect(result.items[0].order).toBeUndefined()
    })
})
