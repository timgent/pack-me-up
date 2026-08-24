import { describe, it, expect } from 'vitest'
import { activeQuestionSet } from './tombstones'
import { PackingListQuestionSet } from './types'

const DELETED = '2026-01-01T00:00:00.000Z'

function makeSet(overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet {
    return { people: [], alwaysNeededItems: [], questions: [], ...overrides }
}

describe('activeQuestionSet', () => {
    it('drops deleted questions, keeping the live ones in order', () => {
        const set = makeSet({
            questions: [
                { id: 'q1', type: 'saved', text: 'Where to?', order: 0, options: [] },
                { id: 'q2', type: 'saved', text: 'Gone?', order: 1, options: [], deletedAt: DELETED },
            ],
        })
        expect(activeQuestionSet(set).questions.map(q => q.id)).toEqual(['q1'])
    })

    it('drops deleted items nested inside a live question option', () => {
        const set = makeSet({
            questions: [{
                id: 'q1', type: 'saved', text: 'Where to?', order: 0,
                options: [{
                    id: 'o1', text: 'Beach', order: 0,
                    items: [
                        { text: 'Towel', personSelections: [] },
                        { text: 'Wetsuit', personSelections: [], deletedAt: DELETED },
                    ],
                }],
            }],
        })
        expect(activeQuestionSet(set).questions[0].options[0].items.map(i => i.text)).toEqual(['Towel'])
    })

    it('drops deleted always-needed items', () => {
        const set = makeSet({
            alwaysNeededItems: [
                { text: 'Passport', personSelections: [] },
                { text: 'Sun cream', personSelections: [], deletedAt: DELETED },
            ],
        })
        expect(activeQuestionSet(set).alwaysNeededItems.map(i => i.text)).toEqual(['Passport'])
    })

    it('drops deleted people', () => {
        const set = makeSet({
            people: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Ghost', deletedAt: DELETED }],
        })
        expect(activeQuestionSet(set).people.map(p => p.name)).toEqual(['Alice'])
    })

    it('leaves the stored set untouched, so writers still carry the tombstones', () => {
        const set = makeSet({
            people: [{ id: 'p2', name: 'Ghost', deletedAt: DELETED }],
            alwaysNeededItems: [{ text: 'Sun cream', personSelections: [], deletedAt: DELETED }],
            questions: [{ id: 'q2', type: 'saved', text: 'Gone?', order: 0, options: [], deletedAt: DELETED }],
        })
        activeQuestionSet(set)
        expect(set.people).toHaveLength(1)
        expect(set.alwaysNeededItems).toHaveLength(1)
        expect(set.questions).toHaveLength(1)
    })

    it('keeps everything else on the set, so it is a drop-in for reading', () => {
        const set = makeSet({ sectionOrder: ['Essentials'], templateVersion: 3, lastModified: DELETED })
        expect(activeQuestionSet(set)).toMatchObject({
            sectionOrder: ['Essentials'],
            templateVersion: 3,
            lastModified: DELETED,
        })
    })
})
