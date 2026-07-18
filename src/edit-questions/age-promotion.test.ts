import { describe, it, expect } from 'vitest'
import { buildPromotionSuggestions, applyAgePromotions } from './age-promotion'
import { AgeTransition } from './age-derivation'
import { createExampleData } from './example-data'
import { PackingListQuestionSet, Person, Item } from './types'

const NOW = '2026-07-18T12:00:00.000Z'

const mum: Person = { id: 'mum', name: 'Mum', ageRange: 'Adult', gender: 'female' }
const kid: Person = { id: 'kid', name: 'Neve', ageRange: 'Toddler', dateOfBirth: '2023-06-01' }

function transition(person: Person, to: AgeTransition['to']): AgeTransition {
    return { person, from: person.ageRange, to }
}

function makeItem(text: string, overrides: Partial<Item> = {}): Item {
    return {
        text,
        personSelections: [
            { personId: 'mum', selected: true },
            { personId: 'kid', selected: false },
        ],
        ...overrides,
    }
}

function minimalQs(alwaysNeededItems: Item[]): PackingListQuestionSet {
    return { _id: '1', people: [mum, kid], questions: [], alwaysNeededItems }
}

describe('buildPromotionSuggestions - toggles', () => {
    it('suggests deselecting tagged items the person has outgrown', () => {
        const qs = minimalQs([
            makeItem('Custom potty', {
                ageRanges: ['Toddler'],
                personSelections: [
                    { personId: 'mum', selected: false },
                    { personId: 'kid', selected: true },
                ],
            }),
        ])
        const suggestions = buildPromotionSuggestions(qs, [transition(kid, 'Child')])
        const ageOut = suggestions.filter(s => s.direction === 'ageOut')
        expect(ageOut).toHaveLength(1)
        expect(ageOut[0]).toMatchObject({
            personId: 'kid',
            itemText: 'Custom potty',
            location: { kind: 'always' },
            itemIndex: 0,
        })
    })

    it('suggests selecting existing tagged items for the new bracket', () => {
        const qs = minimalQs([makeItem('Custom colouring book', { ageRanges: ['Child'] })])
        const suggestions = buildPromotionSuggestions(qs, [transition(kid, 'Child')])
        const ageIn = suggestions.filter(s => s.direction === 'ageIn')
        expect(ageIn).toHaveLength(1)
        expect(ageIn[0]).toMatchObject({ personId: 'kid', itemText: 'Custom colouring book' })
    })

    it('never touches untagged items, deleted items, or other people', () => {
        const qs = minimalQs([
            makeItem('Custom teddy'), // untagged
            makeItem('Custom deleted', { ageRanges: ['Child'], deletedAt: NOW }),
        ])
        const suggestions = buildPromotionSuggestions(qs, [transition(kid, 'Child')])
        const toggles = suggestions.filter(s => s.direction !== 'addItem')
        expect(toggles).toHaveLength(0)
    })

    it('skips items already in the right state', () => {
        const qs = minimalQs([
            makeItem('Custom already selected', {
                ageRanges: ['Child'],
                personSelections: [
                    { personId: 'mum', selected: false },
                    { personId: 'kid', selected: true },
                ],
            }),
        ])
        const suggestions = buildPromotionSuggestions(qs, [transition(kid, 'Child')])
        expect(suggestions.filter(s => s.direction !== 'addItem' && s.itemText === 'Custom already selected')).toHaveLength(0)
    })
})

describe('buildPromotionSuggestions - additions from the default catalog', () => {
    it('suggests default items for the new bracket that are missing from the data', () => {
        // Family generated with a toddler: Child-only defaults were dropped at
        // generation time, so aging up must offer to add them back.
        const qs = createExampleData([mum, kid])
        expect(qs.alwaysNeededItems.find(i => i.text === 'Entertainment (books/small toys)')).toBeUndefined()

        const suggestions = buildPromotionSuggestions(qs, [transition(kid, 'Child')])
        const adds = suggestions.filter(s => s.direction === 'addItem')
        const entertainment = adds.find(s => s.itemText === 'Entertainment (books/small toys)')
        expect(entertainment).toBeDefined()
        expect(entertainment!.location).toEqual({ kind: 'always' })
        expect(entertainment!.newItem!.ageRanges).toEqual(['Child'])
        // Selections align with the family and select the promoted kid
        expect(entertainment!.newItem!.personSelections).toEqual([
            { personId: 'mum', selected: false },
            { personId: 'kid', selected: true },
        ])
    })

    it('places option-level additions in the matching question option', () => {
        const qs = createExampleData([mum, kid])
        const suggestions = buildPromotionSuggestions(qs, [transition(kid, 'Child')])
        const adds = suggestions.filter(s => s.direction === 'addItem')
        const swimAids = adds.find(s => s.itemText === 'Swim aids (noodles, kickboard)')
        expect(swimAids).toBeDefined()
        expect(swimAids!.location.kind).toBe('option')
        expect(swimAids!.contextLabel).toContain('Swimming')
    })

    it('does not re-add items the user has, or previously deleted, or that were already relevant', () => {
        const qs = createExampleData([mum, kid])
        // 'Water bottle' (Toddler+) exists already, and was already relevant before the transition.
        // Simulate the user having deleted a default child item they don't want.
        qs.alwaysNeededItems.push({ ...makeItem('Entertainment (books/small toys)'), deletedAt: NOW })

        const suggestions = buildPromotionSuggestions(qs, [transition(kid, 'Child')])
        const adds = suggestions.filter(s => s.direction === 'addItem')
        expect(adds.find(s => s.itemText === 'Water bottle')).toBeUndefined()
        expect(adds.find(s => s.itemText === 'Entertainment (books/small toys)')).toBeUndefined()
    })

    it('produces no suggestions when there are no transitions', () => {
        const qs = createExampleData([mum, kid])
        expect(buildPromotionSuggestions(qs, [])).toEqual([])
    })
})

describe('applyAgePromotions', () => {
    it('updates the stored bracket for every transition, even with nothing accepted', () => {
        const qs = minimalQs([])
        const result = applyAgePromotions(qs, [transition(kid, 'Child')], [], NOW)
        const updatedKid = result.people.find(p => p.id === 'kid')!
        expect(updatedKid.ageRange).toBe('Child')
        expect(updatedKid.lastModified).toBe(NOW)
        // untouched person is not restamped
        expect(result.people.find(p => p.id === 'mum')).toEqual(mum)
    })

    it('flips selections for accepted toggles and stamps the item', () => {
        const qs = minimalQs([
            makeItem('Custom potty', {
                ageRanges: ['Toddler'],
                personSelections: [
                    { personId: 'mum', selected: false },
                    { personId: 'kid', selected: true },
                ],
            }),
            makeItem('Custom colouring book', { ageRanges: ['Child'] }),
        ])
        const suggestions = buildPromotionSuggestions(qs, [transition(kid, 'Child')])
            .filter(s => s.direction !== 'addItem')
        const result = applyAgePromotions(qs, [transition(kid, 'Child')], suggestions, NOW)

        const potty = result.alwaysNeededItems[0]
        expect(potty.personSelections.find(ps => ps.personId === 'kid')!.selected).toBe(false)
        expect(potty.lastModified).toBe(NOW)
        const book = result.alwaysNeededItems[1]
        expect(book.personSelections.find(ps => ps.personId === 'kid')!.selected).toBe(true)
    })

    it('inserts accepted catalog items with an id and timestamp', () => {
        const qs = createExampleData([mum, kid])
        const adds = buildPromotionSuggestions(qs, [transition(kid, 'Child')])
            .filter(s => s.direction === 'addItem' && s.itemText === 'Entertainment (books/small toys)')
        const result = applyAgePromotions(qs, [transition(kid, 'Child')], adds, NOW)

        const added = result.alwaysNeededItems.find(i => i.text === 'Entertainment (books/small toys)')!
        expect(added).toBeDefined()
        expect(added.id).toBeTruthy()
        expect(added.lastModified).toBe(NOW)
        expect(added.ageRanges).toEqual(['Child'])
    })

    it('leaves rejected suggestions untouched', () => {
        const qs = minimalQs([
            makeItem('Custom potty', {
                ageRanges: ['Toddler'],
                personSelections: [
                    { personId: 'mum', selected: false },
                    { personId: 'kid', selected: true },
                ],
            }),
        ])
        const result = applyAgePromotions(qs, [transition(kid, 'Child')], [], NOW)
        expect(result.alwaysNeededItems[0].personSelections.find(ps => ps.personId === 'kid')!.selected).toBe(true)
        expect(result.alwaysNeededItems[0].lastModified).toBeUndefined()
    })
})
