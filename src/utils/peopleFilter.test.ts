import { describe, it, expect } from 'vitest'
import {
    togglePerson,
    isFiltered,
    filterSummary,
    personTotals,
    filterNames,
    filterLabel,
    sharedTotal,
    SHARED_FILTER_KEY,
} from './peopleFilter'
import type { PackingListItem } from '../create-packing-list/types'

function item(overrides: Partial<PackingListItem> & { id: string; itemText: string }): PackingListItem {
    return {
        personId: '',
        personName: '',
        questionId: 'q1',
        optionId: 'o1',
        packed: false,
        ...overrides,
    }
}

describe('togglePerson', () => {
    it('selects only that person when nothing is filtered yet', () => {
        expect([...togglePerson(new Set(), 'Alice')]).toEqual(['Alice'])
    })

    it('adds a second person to an existing selection', () => {
        expect([...togglePerson(new Set(['Alice']), 'Bob')].sort()).toEqual(['Alice', 'Bob'])
    })

    it('takes a person back out of a selection', () => {
        expect([...togglePerson(new Set(['Alice', 'Bob']), 'Alice')]).toEqual(['Bob'])
    })

    it('returns to no filter when the last person is tapped off', () => {
        expect(togglePerson(new Set(['Bob']), 'Bob').size).toBe(0)
    })

    it('never mutates the set it was given', () => {
        const before = new Set(['Alice'])
        togglePerson(before, 'Bob')
        expect([...before]).toEqual(['Alice'])
    })
})

describe('isFiltered', () => {
    it('is false for an empty selection, which means everyone', () => {
        expect(isFiltered(new Set())).toBe(false)
        expect(isFiltered(new Set(['Alice']))).toBe(true)
    })
})

describe('personTotals', () => {
    const items = [
        item({ id: '1', itemText: 'Socks', personName: 'Alice', packed: true }),
        item({ id: '2', itemText: 'Hat', personName: 'Alice' }),
        item({ id: '3', itemText: 'Boots', personName: 'Bob' }),
        item({ id: '4', itemText: 'Tent', communal: true, packed: true }),
    ]

    it("counts what is packed of each person's own items", () => {
        const totals = personTotals(items, { '1': true, '4': true })

        expect(totals.get('Alice')).toEqual({ packed: 1, total: 2 })
        expect(totals.get('Bob')).toEqual({ packed: 0, total: 1 })
    })

    it('leaves shared items out, so no denominator is inflated by the tent', () => {
        const totals = personTotals(items, { '1': true, '4': true })

        expect([...totals.values()].reduce((sum, stat) => sum + stat.total, 0)).toBe(3)
    })

    it('reads packed state from the form rather than the stored item', () => {
        const totals = personTotals(items, {})

        expect(totals.get('Alice')).toEqual({ packed: 0, total: 2 })
    })
})

describe('filterSummary', () => {
    it('says nothing when there is no filter', () => {
        expect(filterSummary(new Set(), 12, 12)).toBe('')
    })

    it('names the person and how much of the list is left, without guessing a pronoun', () => {
        expect(filterSummary(new Set(['Alice']), 3, 12)).toBe("Showing Alice's items. 3 of 12 categories.")
    })

    it('lists two people rather than picking one', () => {
        expect(filterSummary(new Set(['Alice', 'Bob']), 5, 12))
            .toBe("Showing Alice and Bob's items. 5 of 12 categories.")
    })

    it('uses commas past two', () => {
        expect(filterSummary(new Set(['Alice', 'Bob', 'Cara']), 9, 12))
            .toBe("Showing Alice, Bob and Cara's items. 9 of 12 categories.")
    })
})

describe('filterNames', () => {
    it('is empty when nothing is selected', () => {
        expect(filterNames(new Set())).toBe('')
    })

    it('names one person', () => {
        expect(filterNames(new Set(['Alice']))).toBe('Alice')
    })

    it('joins two with "and", so the bar reads as a sentence', () => {
        expect(filterNames(new Set(['Bob', 'Alice']))).toBe('Alice and Bob')
    })

    it('calls the shared chip the group, and puts it last', () => {
        expect(filterNames(new Set([SHARED_FILTER_KEY, 'Alice']))).toBe('Alice and the group')
        expect(filterNames(new Set([SHARED_FILTER_KEY]))).toBe('the group')
    })
})

describe('filterLabel', () => {
    // Beside a count, where a comma-joined list would read as a truncated one
    it('names one person', () => {
        expect(filterLabel(new Set(['Alice']))).toBe('Alice')
    })

    it('stops at a headcount past one', () => {
        expect(filterLabel(new Set(['Alice', 'Bob']))).toBe('2 people')
    })

    it('calls the shared chip on its own "shared items"', () => {
        expect(filterLabel(new Set([SHARED_FILTER_KEY]))).toBe('shared items')
    })
})

describe('sharedTotal', () => {
    it('counts the group’s items and nobody else’s', () => {
        const items = [
            item({ id: '1', itemText: 'Tent', communal: true, packed: true }),
            item({ id: '2', itemText: 'Stove', communal: true }),
            item({ id: '3', itemText: 'Socks', personName: 'Alice' }),
        ]

        expect(sharedTotal(items, { '1': true })).toEqual({ packed: 1, total: 2 })
    })
})
