import { describe, it, expect } from 'vitest'
import {
    ALWAYS_NEEDED_CATEGORY,
    CATEGORIES,
    CATEGORY_ORDER,
    defaultCategoryFor,
    groupItemsIntoSections,
    assignItemsToSection,
    renameSection,
    removeSection,
    sectionNamesIn,
    buildSectionSequence,
    buildSectionGroups,
    applySectionLayout,
    sectionLabelAt,
    sectionLabelsIn,
    moveItemWithinSection,
    moveItemToSection,
    isAtSectionEdge,
    pruneFilledSections,
    reconcileEmptySections,
    addEmptySection,
    forgetEmptySection,
    type SectionSequenceEntry,
} from './item-sections'
import type { Item, Question, Option } from './types'

const now = '2024-06-01T00:00:00.000Z'
const before = '2024-01-01T00:00:00.000Z'

function item(overrides: Partial<Item> & { id: string; text: string }): Item {
    return { personSelections: [], lastModified: before, ...overrides }
}

const option: Option = { id: 'opt-yes', text: 'Yes', order: 0, items: [] }

describe('defaultCategoryFor', () => {
    const question = (questionType?: Question['questionType']): Question => ({
        id: 'q1', type: 'saved', text: 'Staying overnight?', order: 0, questionType, options: [option],
    })

    it('uses the option text for multiple-choice questions', () => {
        expect(defaultCategoryFor(question('multiple-choice'), option)).toBe('Yes')
    })

    it('uses the question text for single-choice questions', () => {
        expect(defaultCategoryFor(question('single-choice'), option)).toBe('Staying overnight?')
    })

    it('treats a question with no explicit type as single-choice', () => {
        expect(defaultCategoryFor(question(undefined), option)).toBe('Staying overnight?')
    })
})

describe('groupItemsIntoSections', () => {
    it('puts unstamped items under the default label', () => {
        const items = [item({ id: 'i1', text: 'Snacks', order: 0 })]
        const groups = groupItemsIntoSections(items, ALWAYS_NEEDED_CATEGORY)
        expect(groups).toEqual([{ label: 'Essentials', items }])
    })

    it('splits stamped items into their own sections, ordered by earliest item', () => {
        const items = [
            item({ id: 'i1', text: 'Snacks', order: 0 }),
            item({ id: 'i2', text: 'Nappies', order: 1, category: 'Baby' }),
            item({ id: 'i3', text: 'Wipes', order: 2, category: 'Baby' }),
            item({ id: 'i4', text: 'Plasters', order: 3, category: 'First aid' }),
        ]
        const groups = groupItemsIntoSections(items, ALWAYS_NEEDED_CATEGORY)
        expect(groups.map(g => g.label)).toEqual(['Essentials', 'Baby', 'First aid'])
        expect(groups[1].items.map(i => i.text)).toEqual(['Nappies', 'Wipes'])
    })

    it('keeps a section contiguous even when its items are interleaved by order', () => {
        // A merge or an old-client write can leave order and category disagreeing.
        // Grouping by label (never a positional walk) means the section still
        // renders once, rather than the header appearing twice.
        const items = [
            item({ id: 'i1', text: 'Nappies', order: 0, category: 'Baby' }),
            item({ id: 'i2', text: 'Plasters', order: 1, category: 'First aid' }),
            item({ id: 'i3', text: 'Wipes', order: 2, category: 'Baby' }),
        ]
        const groups = groupItemsIntoSections(items, ALWAYS_NEEDED_CATEGORY)
        expect(groups.map(g => g.label)).toEqual(['Baby', 'First aid'])
        expect(groups[0].items.map(i => i.text)).toEqual(['Nappies', 'Wipes'])
    })
})

describe('sectionNamesIn', () => {
    it('lists distinct category names across every item-bearing location', () => {
        const qs = {
            _id: '1',
            people: [],
            alwaysNeededItems: [item({ id: 'i1', text: 'Nappies', category: 'Baby' })],
            questions: [{
                id: 'q1', type: 'saved' as const, text: 'Overnight?', order: 0,
                options: [{
                    id: 'o1', text: 'Yes', order: 0,
                    items: [
                        item({ id: 'i2', text: 'Toothbrush', category: 'Toiletries' }),
                        item({ id: 'i3', text: 'Toothpaste', category: 'Toiletries' }),
                    ],
                }],
            }],
        }
        expect(sectionNamesIn(qs).sort()).toEqual(['Baby', 'Toiletries'])
    })
})

describe('assignItemsToSection', () => {
    const items = [
        item({ id: 'i1', text: 'Nappies', order: 0 }),
        item({ id: 'i2', text: 'Snacks', order: 1 }),
    ]

    it('stamps the category and a fresh lastModified on the moved item only', () => {
        const result = assignItemsToSection(items, ['i1'], 'Baby', now)
        expect(result[0].category).toBe('Baby')
        expect(result[0].lastModified).toBe(now)
        expect(result[1].category).toBeUndefined()
        expect(result[1].lastModified).toBe(before)
    })

    it('clears the category when moving an item back to the default section', () => {
        const stamped = [item({ id: 'i1', text: 'Nappies', order: 0, category: 'Baby' })]
        const result = assignItemsToSection(stamped, ['i1'], undefined, now)
        expect(result[0].category).toBeUndefined()
        expect(result[0].lastModified).toBe(now)
    })

    it('leaves items untouched when the category is already correct', () => {
        const stamped = [item({ id: 'i1', text: 'Nappies', order: 0, category: 'Baby' })]
        expect(assignItemsToSection(stamped, ['i1'], 'Baby', now)[0]).toBe(stamped[0])
    })
})

describe('renameSection', () => {
    it('restamps every item in the section, including soft-deleted ones', () => {
        const items = [
            item({ id: 'i1', text: 'Nappies', category: 'Baby' }),
            item({ id: 'i2', text: 'Wipes', category: 'Baby', deletedAt: before }),
            item({ id: 'i3', text: 'Plasters', category: 'First aid' }),
        ]
        const result = renameSection(items, 'Baby', 'Baby & toddler', now)
        expect(result.map(i => i.category)).toEqual(['Baby & toddler', 'Baby & toddler', 'First aid'])
        // A restored item must come back into the renamed section, so deleted
        // items are renamed too rather than being left pointing at a dead name.
        expect(result[1].category).toBe('Baby & toddler')
        expect(result[2].lastModified).toBe(before)
    })
})

describe('buildSectionSequence', () => {
    it('interleaves a header before each section, default section first', () => {
        const items = [
            item({ id: 'i1', text: 'Snacks', order: 0 }),
            item({ id: 'i2', text: 'Nappies', order: 1, category: 'Baby' }),
        ]
        const sequence = buildSectionSequence(items, 'Essentials', [])
        expect(sequence.map(e => e.kind === 'header' ? `#${e.label}` : e.item.text))
            .toEqual(['#Essentials', 'Snacks', '#Baby', 'Nappies'])
    })

    it('includes draft sections that have no items yet', () => {
        const items = [item({ id: 'i1', text: 'Snacks', order: 0 })]
        const sequence = buildSectionSequence(items, 'Essentials', ['First aid'])
        expect(sequence.map(e => e.kind === 'header' ? `#${e.label}` : e.item.text))
            .toEqual(['#Essentials', 'Snacks', '#First aid'])
    })

    it('does not duplicate a draft section that has since gained items', () => {
        const items = [item({ id: 'i1', text: 'Plasters', order: 0, category: 'First aid' })]
        const sequence = buildSectionSequence(items, 'Essentials', ['First aid'])
        expect(sequence.filter(e => e.kind === 'header')).toHaveLength(1)
    })

    it('follows array position, not the stale order field', () => {
        // Mid-edit the array is the truth: `order` is left stale on purpose so
        // renumberItemOrder can tell at save which items actually moved.
        const items = [
            item({ id: 'i1', text: 'Wipes', order: 5 }),
            item({ id: 'i2', text: 'Snacks', order: 1 }),
        ]
        const sequence = buildSectionSequence(items, 'Essentials', [])
        expect(sequence.filter(e => e.kind === 'item').map(e => e.kind === 'item' && e.item.text))
            .toEqual(['Wipes', 'Snacks'])
    })

    it('omits the default header when every item is in a named section', () => {
        const items = [item({ id: 'i1', text: 'Plasters', category: 'First aid' })]
        const sequence = buildSectionSequence(items, 'Essentials', [])
        expect(sequence.map(e => e.kind === 'header' ? `#${e.label}` : e.item.text))
            .toEqual(['#First aid', 'Plasters'])
    })
})

describe('buildSectionGroups', () => {
    it('gathers each section and its items', () => {
        const items = [
            item({ id: 'i1', text: 'Snacks' }),
            item({ id: 'i2', text: 'Nappies', category: 'Baby' }),
            item({ id: 'i3', text: 'Wipes', category: 'Baby' }),
        ]
        expect(buildSectionGroups(items, 'Essentials').map(g => [g.label, g.entries.map(e => e.item.text)]))
            .toEqual([['Essentials', ['Snacks']], ['Baby', ['Nappies', 'Wipes']]])
    })

    it('keeps each item pointing at its place in the flat array', () => {
        // Sections group by category, so the last row on screen need not be the
        // last item in the array. Addressing an edit by what the eye sees would
        // change the wrong item.
        const items = [
            item({ id: 'i1', text: 'Nappies', category: 'Baby' }),
            item({ id: 'i2', text: 'Snacks' }),
            item({ id: 'i3', text: 'Wipes', category: 'Baby' }),
        ]
        expect(buildSectionGroups(items, 'Essentials').map(g => g.entries.map(e => e.index)))
            .toEqual([[1], [0, 2]])
    })

    it('returns a single group for a list nobody has split up', () => {
        const groups = buildSectionGroups([item({ id: 'i1', text: 'Snacks' })], 'Essentials')
        expect(groups).toHaveLength(1)
        expect(groups[0].label).toBe('Essentials')
    })

    it('has no groups at all for an empty list', () => {
        expect(buildSectionGroups([], 'Essentials')).toEqual([])
    })
})

describe('applySectionLayout', () => {
    const snacks = item({ id: 'i1', text: 'Snacks' })
    const nappies = item({ id: 'i2', text: 'Nappies' })

    function sequence(...entries: Array<string | Item>): SectionSequenceEntry[] {
        return entries.map(e =>
            typeof e === 'string' ? { kind: 'header' as const, label: e } : { kind: 'item' as const, item: e }
        )
    }

    it('stamps each item with the nearest header above it', () => {
        const result = applySectionLayout(
            sequence('Essentials', snacks, 'Baby', nappies), 'Essentials', now
        )
        expect(result.map(i => [i.text, i.category])).toEqual([
            ['Snacks', undefined],
            ['Nappies', 'Baby'],
        ])
    })

    it('returns items in displayed order so a cross-section drag also moves them', () => {
        const result = applySectionLayout(
            sequence('Baby', nappies, 'Essentials', snacks), 'Essentials', now
        )
        expect(result.map(i => i.text)).toEqual(['Nappies', 'Snacks'])
        expect(result.map(i => i.category)).toEqual(['Baby', undefined])
    })

    it('clears the category for items dragged back under the default header', () => {
        const stamped = item({ id: 'i2', text: 'Nappies', category: 'Baby' })
        const result = applySectionLayout(sequence('Essentials', stamped), 'Essentials', now)
        expect(result[0].category).toBeUndefined()
        expect(result[0].lastModified).toBe(now)
    })

    it('treats items dragged above the first header as the default section', () => {
        const stamped = item({ id: 'i2', text: 'Nappies', category: 'Baby' })
        const result = applySectionLayout(sequence(stamped, 'Baby'), 'Essentials', now)
        expect(result[0].category).toBeUndefined()
    })

    it('only bumps lastModified on items whose section actually changed', () => {
        const stamped = item({ id: 'i2', text: 'Nappies', category: 'Baby' })
        const result = applySectionLayout(sequence('Essentials', snacks, 'Baby', stamped), 'Essentials', now)
        expect(result[0].lastModified).toBe(before)
        expect(result[1].lastModified).toBe(before)
    })

    it('drops empty sections — a header with no items below it stamps nothing', () => {
        const result = applySectionLayout(
            sequence('Essentials', snacks, 'First aid'), 'Essentials', now
        )
        expect(result).toHaveLength(1)
        expect(result[0].category).toBeUndefined()
    })
})

describe('removeSection', () => {
    it('clears the category on its items rather than deleting them', () => {
        const items = [
            item({ id: 'i1', text: 'Nappies', category: 'Baby' }),
            item({ id: 'i2', text: 'Plasters', category: 'First aid' }),
        ]
        const result = removeSection(items, 'Baby', now)
        expect(result).toHaveLength(2)
        expect(result[0].category).toBeUndefined()
        expect(result[0].text).toBe('Nappies')
        expect(result[1].category).toBe('First aid')
    })
})

describe('sequence moves', () => {
    const snacks = item({ id: 'i1', text: 'Snacks' })
    const crisps = item({ id: 'i2', text: 'Crisps' })
    const water = item({ id: 'i3', text: 'Water' })
    const nappies = item({ id: 'i4', text: 'Nappies', category: 'Baby' })
    const wipes = item({ id: 'i5', text: 'Wipes', category: 'Baby' })

    function sequence(...entries: Array<string | Item>): SectionSequenceEntry[] {
        return entries.map(e =>
            typeof e === 'string' ? { kind: 'header' as const, label: e } : { kind: 'item' as const, item: e }
        )
    }

    const labels = (seq: SectionSequenceEntry[]) =>
        seq.map(e => e.kind === 'header' ? `#${e.label}` : e.item.text)

    // Essentials: Snacks, Crisps, Water | Baby: Nappies, Wipes
    const twoSections = () =>
        sequence('Essentials', snacks, crisps, water, 'Baby', nappies, wipes)

    describe('sectionLabelAt', () => {
        it('reports the nearest heading above the entry', () => {
            expect(sectionLabelAt(twoSections(), 2, 'Essentials')).toBe('Essentials')
            expect(sectionLabelAt(twoSections(), 6, 'Essentials')).toBe('Baby')
        })

        it('falls back to the default label above the first heading', () => {
            expect(sectionLabelAt(sequence(snacks, 'Baby', nappies), 0, 'Essentials')).toBe('Essentials')
        })
    })

    describe('sectionLabelsIn', () => {
        it('lists the sections in display order', () => {
            expect(sectionLabelsIn(twoSections(), 'Essentials')).toEqual(['Essentials', 'Baby'])
        })

        it('still offers the default section when it is empty and so has no heading', () => {
            // Every item is categorised, so buildSectionSequence omits the
            // default heading — but "back to the main pile" must stay reachable.
            expect(sectionLabelsIn(sequence('Baby', nappies), 'Essentials')).toEqual(['Essentials', 'Baby'])
        })
    })

    describe('moveItemWithinSection', () => {
        it('moves an item to the top of its own section', () => {
            expect(labels(moveItemWithinSection(twoSections(), 3, 'top')))
                .toEqual(['#Essentials', 'Water', 'Snacks', 'Crisps', '#Baby', 'Nappies', 'Wipes'])
        })

        it('moves an item to the bottom of its own section, above the next heading', () => {
            expect(labels(moveItemWithinSection(twoSections(), 1, 'bottom')))
                .toEqual(['#Essentials', 'Crisps', 'Water', 'Snacks', '#Baby', 'Nappies', 'Wipes'])
        })

        it('keeps a later section intact when its own items move', () => {
            expect(labels(moveItemWithinSection(twoSections(), 6, 'top')))
                .toEqual(['#Essentials', 'Snacks', 'Crisps', 'Water', '#Baby', 'Wipes', 'Nappies'])
        })

        it('leaves the sequence alone when the item is already there', () => {
            const seq = twoSections()
            expect(moveItemWithinSection(seq, 1, 'top')).toEqual(seq)
            expect(moveItemWithinSection(seq, 3, 'bottom')).toEqual(seq)
        })

        it('handles a section with no heading above it', () => {
            expect(labels(moveItemWithinSection(sequence(snacks, crisps, 'Baby', nappies), 1, 'top')))
                .toEqual(['Crisps', 'Snacks', '#Baby', 'Nappies'])
        })
    })

    describe('isAtSectionEdge', () => {
        it('recognises the first and last item of a section', () => {
            const seq = twoSections()
            expect(isAtSectionEdge(seq, 1, 'top')).toBe(true)
            expect(isAtSectionEdge(seq, 2, 'top')).toBe(false)
            expect(isAtSectionEdge(seq, 3, 'bottom')).toBe(true)
            expect(isAtSectionEdge(seq, 5, 'bottom')).toBe(false)
            expect(isAtSectionEdge(seq, 6, 'bottom')).toBe(true)
        })
    })

    describe('moveItemToSection', () => {
        it('appends the item to the end of the target section', () => {
            expect(labels(moveItemToSection(twoSections(), 1, 'Baby', 'Essentials')))
                .toEqual(['#Essentials', 'Crisps', 'Water', '#Baby', 'Nappies', 'Wipes', 'Snacks'])
        })

        it('moves an item back into the default section', () => {
            expect(labels(moveItemToSection(twoSections(), 5, 'Essentials', 'Essentials')))
                .toEqual(['#Essentials', 'Snacks', 'Crisps', 'Water', 'Nappies', '#Baby', 'Wipes'])
        })

        it('moves an item into a section that is still empty', () => {
            const seq = sequence('Essentials', snacks, 'First aid')
            expect(labels(moveItemToSection(seq, 1, 'First aid', 'Essentials')))
                .toEqual(['#Essentials', '#First aid', 'Snacks'])
        })

        it('moves an item to the default section even when it has no heading', () => {
            // Sits above the first heading, which applySectionLayout reads as
            // the default section.
            const seq = sequence('Baby', nappies, wipes)
            expect(labels(moveItemToSection(seq, 1, 'Essentials', 'Essentials')))
                .toEqual(['Nappies', '#Baby', 'Wipes'])
        })

        it('leaves the sequence alone for an unknown section', () => {
            const seq = twoSections()
            expect(moveItemToSection(seq, 1, 'Nowhere', 'Essentials')).toEqual(seq)
        })
    })

    describe('round trip through applySectionLayout', () => {
        it('restamps a menu move into the target section', () => {
            const moved = moveItemToSection(twoSections(), 1, 'Baby', 'Essentials')
            const result = applySectionLayout(moved, 'Essentials', now)
            expect(result.map(i => [i.text, i.category])).toEqual([
                ['Crisps', undefined],
                ['Water', undefined],
                ['Nappies', 'Baby'],
                ['Wipes', 'Baby'],
                ['Snacks', 'Baby'],
            ])
        })
    })
})

describe('CATEGORY_ORDER', () => {
    it('lists every category the template uses', () => {
        for (const name of Object.values(CATEGORIES)) {
            expect(CATEGORY_ORDER, `"${name}" is missing from CATEGORY_ORDER`).toContain(name)
        }
    })

    // Sets written before the template carried categories put every
    // always-needed item here, and those lists should still open with it.
    it('leads with the always-needed default so legacy lists are unchanged', () => {
        expect(CATEGORY_ORDER[0]).toBe(ALWAYS_NEEDED_CATEGORY)
    })

    it('puts the hardest-to-replace things first and the bulkiest last', () => {
        const at = (name: string) => CATEGORY_ORDER.indexOf(name)
        expect(at(CATEGORIES.documents)).toBeLessThan(at(CATEGORIES.clothes))
        expect(at(CATEGORIES.medical)).toBeLessThan(at(CATEGORIES.clothes))
        expect(at(CATEGORIES.clothes)).toBeLessThan(at(CATEGORIES.kit))
        expect(at(CATEGORIES.kit)).toBe(CATEGORY_ORDER.length - 2)
        expect(at(CATEGORIES.pet)).toBe(CATEGORY_ORDER.length - 1)
    })

    // The day bag is the one that has to be right before the door shuts, and
    // it is the shortest section, so it is the first thing you read.
    it('leads with the day bag, ahead of even the documents', () => {
        const at = (name: string) => CATEGORY_ORDER.indexOf(name)
        expect(at(CATEGORIES.dayBag)).toBe(1)
        expect(at(CATEGORIES.dayBag)).toBeLessThan(at(CATEGORIES.documents))
    })

    // Ten sections is already a long walk through the house; the two that were
    // dropped were both really "things I want to hand", which is the day bag.
    it('keeps the section list short enough to hold in your head', () => {
        expect(Object.values(CATEGORIES).length).toBeLessThanOrEqual(10)
        expect(Object.values(CATEGORIES)).not.toContain('Tech & Chargers')
        expect(Object.values(CATEGORIES)).not.toContain('Toys & Games')
    })
})

describe('empty sections', () => {
    describe('buildSectionGroups with recorded empty sections', () => {
        it('shows a section that has nothing in it yet', () => {
            const groups = buildSectionGroups([item({ id: 'i1', text: 'Socks' })], 'Yes', ['Toiletries'])
            expect(groups.map(g => g.label)).toEqual(['Yes', 'Toiletries'])
            expect(groups[1].entries).toEqual([])
        })

        it('keeps the flat index of items right when an empty section precedes them', () => {
            // The index addresses the items array, which knows nothing about a
            // section that holds none of them.
            const items = [item({ id: 'i1', text: 'Socks' }), item({ id: 'i2', text: 'Soap', category: 'Toiletries' })]
            const groups = buildSectionGroups(items, 'Yes', ['Spare'])
            const soap = groups.flatMap(g => g.entries).find(e => e.item.text === 'Soap')
            expect(soap?.index).toBe(1)
        })

        it('does not duplicate a section that has items and is also recorded', () => {
            const items = [item({ id: 'i1', text: 'Soap', category: 'Toiletries' })]
            const groups = buildSectionGroups(items, 'Yes', ['Toiletries'])
            expect(groups.filter(g => g.label === 'Toiletries')).toHaveLength(1)
        })

        it('behaves as before when none are recorded', () => {
            const items = [item({ id: 'i1', text: 'Soap', category: 'Toiletries' })]
            expect(buildSectionGroups(items, 'Yes')).toEqual(buildSectionGroups(items, 'Yes', []))
        })
    })

    describe('pruneFilledSections', () => {
        it('forgets a section once something lands in it', () => {
            const items = [item({ id: 'i1', text: 'Soap', category: 'Toiletries' })]
            expect(pruneFilledSections(['Toiletries', 'Spare'], items)).toEqual(['Spare'])
        })

        it('drops the field entirely once every section has items', () => {
            const items = [item({ id: 'i1', text: 'Soap', category: 'Toiletries' })]
            expect(pruneFilledSections(['Toiletries'], items)).toBeUndefined()
        })

        it('ignores a soft-deleted item, which leaves its section empty again', () => {
            const items = [item({ id: 'i1', text: 'Soap', category: 'Toiletries', deletedAt: now })]
            expect(pruneFilledSections(['Toiletries'], items)).toEqual(['Toiletries'])
        })

        it('passes undefined through', () => {
            expect(pruneFilledSections(undefined, [])).toBeUndefined()
        })
    })

    describe('addEmptySection', () => {
        it('records a brand new section', () => {
            expect(addEmptySection(undefined, [], 'Toiletries', 'Yes')).toEqual(['Toiletries'])
        })

        it('appends to the ones already recorded', () => {
            expect(addEmptySection(['Spare'], [], 'Toiletries', 'Yes')).toEqual(['Spare', 'Toiletries'])
        })

        it('refuses a name that already has items — it exists already', () => {
            const items = [item({ id: 'i1', text: 'Soap', category: 'Toiletries' })]
            expect(addEmptySection(undefined, items, 'Toiletries', 'Yes')).toBeUndefined()
        })

        it('refuses a duplicate of one already recorded', () => {
            expect(addEmptySection(['Toiletries'], [], 'Toiletries', 'Yes')).toEqual(['Toiletries'])
        })

        it('refuses the default section, which always exists', () => {
            expect(addEmptySection(undefined, [], 'Yes', 'Yes')).toBeUndefined()
        })
    })

    describe('forgetEmptySection', () => {
        it('drops the removed name', () => {
            expect(forgetEmptySection(['Spare', 'Toiletries'], 'Spare')).toEqual(['Toiletries'])
        })

        it('drops the field entirely once nothing is left', () => {
            expect(forgetEmptySection(['Toiletries'], 'Toiletries')).toBeUndefined()
        })

        it('leaves a list that never mentioned the section alone', () => {
            expect(forgetEmptySection(['Toiletries'], 'Spare')).toEqual(['Toiletries'])
        })

        it('copes with a list that was never recorded', () => {
            expect(forgetEmptySection(undefined, 'Toiletries')).toBeUndefined()
        })
    })

    describe('sectionNamesIn', () => {
        it('offers an empty section by name, so it can be filed into from elsewhere', () => {
            const qs = {
                _id: '1',
                people: [],
                alwaysNeededItems: [],
                alwaysNeededEmptySections: ['Documents'],
                questions: [{
                    id: 'q1', type: 'saved' as const, text: 'Overnight?', order: 0,
                    options: [{ id: 'o1', text: 'Yes', order: 0, items: [], emptySections: ['Toiletries'] }],
                }],
            }
            expect(sectionNamesIn(qs).sort()).toEqual(['Documents', 'Toiletries'])
        })
    })
})

describe('reconcileEmptySections', () => {
    const soap = item({ id: 'i1', text: 'Soap', category: 'Toiletries' })
    const socks = item({ id: 'i2', text: 'Socks' })

    it('keeps a section whose last item has just gone', () => {
        // Deleting an item is not a request to delete the section it was in.
        expect(reconcileEmptySections([soap, socks], [socks], undefined)).toEqual(['Toiletries'])
    })

    it('forgets a recorded section once it has items', () => {
        expect(reconcileEmptySections([socks], [socks, soap], ['Toiletries'])).toBeUndefined()
    })

    it('leaves a section alone while it still has items', () => {
        const other = item({ id: 'i3', text: 'Shampoo', category: 'Toiletries' })
        expect(reconcileEmptySections([soap, other], [other], undefined)).toBeUndefined()
    })

    it('does not invent a section that was already empty and unrecorded', () => {
        expect(reconcileEmptySections([socks], [socks], undefined)).toBeUndefined()
    })

    it('keeps recorded sections that are still empty', () => {
        expect(reconcileEmptySections([socks], [socks], ['Spare'])).toEqual(['Spare'])
    })

    it('treats a soft-deleted item as gone, keeping its section', () => {
        const tombstoned = { ...soap, deletedAt: now }
        expect(reconcileEmptySections([soap, socks], [tombstoned, socks], undefined)).toEqual(['Toiletries'])
    })
})
