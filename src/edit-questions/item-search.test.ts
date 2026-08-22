import { describe, it, expect } from 'vitest'
import { MIN_QUERY_LENGTH, searchQuestionSetItems, sectionNamesItsList } from './item-search'
import type { Item, PackingListQuestionSet, Question } from './types'

function item(overrides: Partial<Item> & { text: string }): Item {
    return { id: overrides.text.toLowerCase(), personSelections: [], ...overrides }
}

function question(overrides: Partial<Question> & { id: string; text: string }): Question {
    return {
        type: 'saved',
        order: 0,
        questionType: 'single-choice',
        options: [],
        ...overrides,
    } as Question
}

/** A set with one item in an option, one in the always-needed list. */
function makeSet(overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet {
    return {
        people: [],
        alwaysNeededItems: [item({ text: 'Sun hat', category: 'Clothes' })],
        questions: [
            question({
                id: 'q1',
                text: 'Beach holiday?',
                options: [
                    {
                        id: 'o1', order: 0, text: 'Yes', items: [
                            item({ text: 'Sun cream', category: 'Toiletries' }),
                            item({ text: 'Towel' }),
                        ],
                    },
                ],
            }),
        ],
        ...overrides,
    }
}

describe('searchQuestionSetItems', () => {
    it('finds items by case-insensitive substring, in the list order the page shows', () => {
        const results = searchQuestionSetItems(makeSet(), 'SUN')
        expect(results.total).toBe(2)
        expect(results.groups.flatMap(g => g.sections.flatMap(s => s.matches.map(m => m.item.text))))
            .toEqual(['Sun hat', 'Sun cream'])
    })

    it('reports where the match starts, so the row can highlight it', () => {
        const results = searchQuestionSetItems(makeSet(), 'cream')
        expect(results.groups[0].sections[0].matches[0].matchStart).toBe(4)
    })

    it('gives an option item its question, answer and section as context', () => {
        const results = searchQuestionSetItems(makeSet(), 'cream')
        expect(results.groups).toHaveLength(1)
        expect(results.groups[0].crumbs).toEqual(['Beach holiday?', 'Yes'])
        expect(results.groups[0].sections[0].label).toBe('Toiletries')
        expect(results.groups[0].location).toEqual({ kind: 'option', questionId: 'q1', optionId: 'o1' })
    })

    it('names the always-needed list and the section within it', () => {
        const results = searchQuestionSetItems(makeSet(), 'hat')
        expect(results.groups[0].crumbs).toEqual(['Always Needed Items'])
        expect(results.groups[0].sections[0].label).toBe('Clothes')
        expect(results.groups[0].location).toEqual({ kind: 'always' })
        expect(results.groups[0].defaultLabel).toBe('Essentials')
    })

    it('falls back to the question text for an item with no section of its own, without repeating it', () => {
        const results = searchQuestionSetItems(makeSet(), 'towel')
        const [group] = results.groups
        expect(group.crumbs).toEqual(['Beach holiday?', 'Yes'])
        expect(group.sections[0].label).toBe('Beach holiday?')
        expect(group.sections[0].isDefault).toBe(true)
        // ...and saying so under the trail would only repeat it.
        expect(sectionNamesItsList(group, group.sections[0])).toBe(true)
    })

    it('falls back to the option text on a multiple-choice question', () => {
        const set = makeSet({
            questions: [question({
                id: 'q1',
                text: 'What are you doing?',
                questionType: 'multiple-choice',
                options: [{ id: 'o1', order: 0, text: 'Swimming', items: [item({ text: 'Goggles' })] }],
            })],
        })
        const results = searchQuestionSetItems(set, 'goggles')
        expect(results.groups[0].crumbs).toEqual(['What are you doing?', 'Swimming'])
        expect(results.groups[0].defaultLabel).toBe('Swimming')
    })

    it('gathers an answer\'s matches under it, split by section', () => {
        const set = makeSet({
            alwaysNeededItems: [],
            questions: [question({
                id: 'q1', text: 'Beach holiday?', options: [{
                    id: 'o1', order: 0, text: 'Yes', items: [
                        item({ text: 'Sun cream', category: 'Toiletries' }),
                        item({ text: 'Sun hat' }),
                        item({ text: 'Sunglasses', category: 'Toiletries' }),
                    ],
                }],
            })],
        })
        const results = searchQuestionSetItems(set, 'sun')
        // One card for the answer, its sections inside it — the answer is named
        // once however many of its sections matched.
        expect(results.groups).toHaveLength(1)
        expect(results.groups[0].count).toBe(3)
        expect(results.groups[0].sections.map(s => s.label)).toEqual(['Toiletries', 'Beach holiday?'])
        // Two hits in one section stay together rather than splitting it in two.
        expect(results.groups[0].sections[0].matches.map(m => m.item.text))
            .toEqual(['Sun cream', 'Sunglasses'])
    })

    it('indexes option items by their position in the stored list', () => {
        const results = searchQuestionSetItems(makeSet(), 'towel')
        expect(results.groups[0].sections[0].matches[0].index).toBe(1)
    })

    it('indexes always-needed items by their position among the undeleted ones', () => {
        const set = makeSet({
            alwaysNeededItems: [
                item({ text: 'Old passport', deletedAt: '2024-01-01T00:00:00.000Z' }),
                item({ text: 'Passport' }),
            ],
        })
        const results = searchQuestionSetItems(set, 'passport')
        expect(results.total).toBe(1)
        expect(results.groups[0].sections[0].matches[0].index).toBe(0)
    })

    it('skips deleted questions and deleted items', () => {
        const set = makeSet({
            questions: [
                question({ id: 'q1', text: 'Gone?', deletedAt: '2024-01-01T00:00:00.000Z', options: [
                    { id: 'o1', order: 0, text: 'Yes', items: [item({ text: 'Sun cream' })] },
                ] }),
                question({ id: 'q2', text: 'Here?', options: [
                    { id: 'o2', order: 0, text: 'Yes', items: [
                        item({ text: 'Sun lotion', deletedAt: '2024-01-01T00:00:00.000Z' }),
                    ] },
                ] }),
            ],
            alwaysNeededItems: [],
        })
        expect(searchQuestionSetItems(set, 'sun').total).toBe(0)
    })

    it('finds nothing for a query shorter than the minimum', () => {
        const short = 's'.repeat(MIN_QUERY_LENGTH - 1)
        expect(searchQuestionSetItems(makeSet(), short).groups).toEqual([])
        expect(searchQuestionSetItems(makeSet(), '   ').groups).toEqual([])
    })

    it('caps how many matches it returns but counts them all', () => {
        const set = makeSet({
            alwaysNeededItems: [item({ text: 'Sun hat' }), item({ text: 'Sun cream' }), item({ text: 'Sunglasses' })],
            questions: [],
        })
        const results = searchQuestionSetItems(set, 'sun', { limit: 2 })
        expect(results.total).toBe(3)
        expect(results.shown).toBe(2)
    })

    it('keeps a pinned item in the results even once it stops matching', () => {
        const set = makeSet({
            alwaysNeededItems: [item({ id: 'renamed', text: 'Beach towel' })],
            questions: [],
        })
        const results = searchQuestionSetItems(set, 'sun', { pinnedItemId: 'renamed' })
        // Present so an editor open on it doesn't vanish mid-rename, but not
        // counted: nothing here matches what was typed.
        expect(results.total).toBe(0)
        expect(results.groups[0].sections[0].matches[0].item.text).toBe('Beach towel')
        expect(results.groups[0].sections[0].matches[0].matchStart).toBe(-1)
    })
})
