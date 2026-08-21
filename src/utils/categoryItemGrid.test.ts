import { describe, it, expect } from 'vitest'
import {
    buildCategoryRows,
    buildGridColumns,
    SHARED_ROW_SUFFIX,
    UNASSIGNED_COLUMN_KEY,
} from './categoryItemGrid'
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

const alice = { name: 'Alice', id: 'p1' }
const bob = { name: 'Bob', id: 'p2' }

/** The columns a two-person list has, which is what most of these rows sit on. */
const twoColumns = buildGridColumns([alice, bob], [])

describe('buildGridColumns', () => {
    it('gives every person on the list a column, whatever is in this category', () => {
        expect(buildGridColumns([alice, bob], []).map(column => column.name)).toEqual(['Alice', 'Bob'])
    })

    it('keeps the order the list puts its people in', () => {
        expect(buildGridColumns([bob, alice], []).map(column => column.name)).toEqual(['Bob', 'Alice'])
    })

    it('gives someone the list does not name a column of their own, after the rest', () => {
        const columns = buildGridColumns([alice], [
            item({ id: '1', itemText: 'Toothbrush', personName: 'Zoe', personId: 'p9' }),
        ])

        expect(columns.map(column => column.name)).toEqual(['Alice', 'Zoe'])
        expect(columns[1].personId).toBe('p9')
    })

    it('adds an unassigned column, last, only when something is unassigned', () => {
        expect(buildGridColumns([alice], []).map(column => column.key)).toEqual(['Alice'])

        const columns = buildGridColumns([alice], [item({ id: '1', itemText: 'Torch' })])
        expect(columns.map(column => column.key)).toEqual(['Alice', UNASSIGNED_COLUMN_KEY])
        expect(columns[1].unassigned).toBe(true)
    })

    it('does not mistake a shared item for an unassigned one', () => {
        const columns = buildGridColumns([alice], [item({ id: '1', itemText: 'Tent', communal: true })])

        expect(columns.map(column => column.key)).toEqual(['Alice'])
    })
})

describe('buildCategoryRows', () => {
    describe('rows', () => {
        it('gives an item one row however many people need it', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1' }),
                item({ id: '2', itemText: 'Toothbrush', personName: 'Bob', personId: 'p2' }),
            ], twoColumns)

            expect(rows.map(row => row.label)).toEqual(['Toothbrush'])
            expect(rows[0].items.map(i => i.id)).toEqual(['1', '2'])
        })

        it('lines each person up with their own copy, and leaves a gap where there is none', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1' }),
                item({ id: '2', itemText: 'Sunhat', personName: 'Bob', personId: 'p2' }),
            ], twoColumns)

            expect(rows.find(row => row.label === 'Toothbrush')!.cells.map(cell => cell?.id)).toEqual(['1', undefined])
            expect(rows.find(row => row.label === 'Sunhat')!.cells.map(cell => cell?.id)).toEqual([undefined, '2'])
        })

        it('keeps a cell for every column, including people with nothing in this category', () => {
            const rows = buildCategoryRows(
                [item({ id: '1', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1' })],
                twoColumns,
            )

            expect(rows[0].cells).toHaveLength(2)
        })

        it('matches names that differ only in case or spacing, keeping the first spelling', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1' }),
                item({ id: '2', itemText: ' toothbrush ', personName: 'Bob', personId: 'p2' }),
            ], twoColumns)

            expect(rows.map(row => row.label)).toEqual(['Toothbrush'])
            expect(rows[0].items).toHaveLength(2)
        })

        it('gives a second copy for the same person a row of its own, so neither loses its checkbox', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Socks', personName: 'Alice', personId: 'p1' }),
                item({ id: '2', itemText: 'Socks', personName: 'Alice', personId: 'p1' }),
                item({ id: '3', itemText: 'Socks', personName: 'Bob', personId: 'p2' }),
            ], twoColumns)

            expect(rows).toHaveLength(2)
            expect(rows[0].cells.map(cell => cell?.id)).toEqual(['1', '3'])
            expect(rows[1].cells.map(cell => cell?.id)).toEqual(['2', undefined])
            // Two rows for one name need two keys, or React sees one row
            expect(rows[0].key).not.toEqual(rows[1].key)
        })

        it('orders rows by the question set order, then alphabetically', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Zebra socks', personName: 'Alice', personId: 'p1', order: 2 }),
                item({ id: '2', itemText: 'Anorak', personName: 'Alice', personId: 'p1', order: 5 }),
                item({ id: '3', itemText: 'Boots', personName: 'Alice', personId: 'p1' }),
                item({ id: '4', itemText: 'Anorak', personName: 'Bob', personId: 'p2', order: 1 }),
            ], twoColumns)

            // Anorak ranks by the earliest order among its copies
            expect(rows.map(row => row.label)).toEqual(['Anorak', 'Zebra socks', 'Boots'])
        })

        it('files an item belonging to nobody in the unassigned column', () => {
            const columns = buildGridColumns([alice], [item({ id: '1', itemText: 'Torch' })])
            const rows = buildCategoryRows([item({ id: '1', itemText: 'Torch' })], columns)

            expect(rows[0].cells.map(cell => cell?.id)).toEqual([undefined, '1'])
        })

        it('keeps packed items, so a ticked cell never looks like one nobody needs', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1', packed: true }),
            ], twoColumns)

            expect(rows[0].items.map(i => i.id)).toEqual(['1'])
        })
    })

    describe('shared items', () => {
        it('gives a shared item a row that belongs to no column', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Tent', communal: true }),
                item({ id: '2', itemText: 'Toothbrush', personName: 'Alice', personId: 'p1' }),
            ], twoColumns)

            const tent = rows.find(row => row.label === 'Tent')!
            expect(tent.communal).toBe(true)
            expect(tent.items.map(i => i.id)).toEqual(['1'])
            expect(tent.cells).toEqual([])
        })

        it('puts shared rows ahead of the rest, the way the shared card comes first', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Anorak', personName: 'Alice', personId: 'p1', order: 1 }),
                item({ id: '2', itemText: 'Tent', communal: true, order: 9 }),
            ], twoColumns)

            expect(rows.map(row => row.label)).toEqual(['Tent', 'Anorak'])
        })

        it('keeps a shared item apart from a personal item of the same name', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Tent', communal: true }),
                item({ id: '2', itemText: 'Tent', personName: 'Alice', personId: 'p1' }),
            ], twoColumns)

            expect(rows).toHaveLength(2)
            expect(rows.filter(row => row.communal)).toHaveLength(1)
            expect(rows.some(row => row.key.includes(SHARED_ROW_SUFFIX))).toBe(true)
        })
    })

    describe('quantities', () => {
        it('reports a quantity every copy shares', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Socks', personName: 'Alice', personId: 'p1', quantity: 3 }),
                item({ id: '2', itemText: 'Socks', personName: 'Bob', personId: 'p2', quantity: 3 }),
            ], twoColumns)

            expect(rows[0].quantity).toBe(3)
            expect(rows[0].mixedQuantities).toBe(false)
        })

        it('reports quantities that differ as mixed, so each cell can say its own', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Socks', personName: 'Alice', personId: 'p1', quantity: 3 }),
                item({ id: '2', itemText: 'Socks', personName: 'Bob', personId: 'p2', quantity: 5 }),
            ], twoColumns)

            expect(rows[0].quantity).toBeUndefined()
            expect(rows[0].mixedQuantities).toBe(true)
        })

        it('treats an absent quantity as one', () => {
            const rows = buildCategoryRows([
                item({ id: '1', itemText: 'Socks', personName: 'Alice', personId: 'p1' }),
                item({ id: '2', itemText: 'Socks', personName: 'Bob', personId: 'p2', quantity: 1 }),
            ], twoColumns)

            expect(rows[0].quantity).toBeUndefined()
            expect(rows[0].mixedQuantities).toBe(false)
        })
    })
})

describe('column initials', () => {
    const initialsOf = (people: { name: string; id: string }[], items: PackingListItem[] = []) =>
        buildGridColumns(people, items).map(column => column.initial)

    it('uses a single letter when that is enough to tell everyone apart', () => {
        expect(initialsOf([alice, bob])).toEqual(['A', 'B'])
    })

    it('grows the initial when two people share a first letter', () => {
        expect(initialsOf([alice, { name: 'Amy', id: 'p3' }])).toEqual(['Al', 'Am'])
    })

    it('keeps every initial the same length, so the chips stay one size', () => {
        const initials = initialsOf([alice, { name: 'Amy', id: 'p3' }, bob])

        expect(initials).toEqual(['Al', 'Am', 'Bo'])
    })

    it('prefers first and last initials for someone with two names', () => {
        expect(initialsOf([{ name: 'Alice Smith', id: 'p1' }, { name: 'Alice Jones', id: 'p2' }]))
            .toEqual(['AS', 'AJ'])
    })

    it('goes to three letters when two will not do', () => {
        expect(initialsOf([{ name: 'Alan', id: 'p1' }, { name: 'Alba', id: 'p2' }]))
            .toEqual(['Ala', 'Alb'])
    })

    it('leaves the unassigned column its question mark', () => {
        const columns = buildGridColumns([alice], [item({ id: '1', itemText: 'Torch' })])

        expect(columns[1].initial).toBe('?')
    })
})
