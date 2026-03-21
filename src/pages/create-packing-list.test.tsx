import { describe, it, expect } from 'vitest'
import { deduplicateItems } from './create-packing-list'
import { PackingListItem } from '../create-packing-list/types'

const makeItem = (overrides: Partial<PackingListItem> & { itemText: string; personId: string }): PackingListItem => ({
    id: 'test-id',
    personName: 'Alice',
    questionId: 'q1',
    optionId: 'o1',
    packed: false,
    ...overrides,
})

describe('deduplicateItems', () => {
    it('keeps a single item when there are no duplicates', () => {
        const items = [makeItem({ itemText: 'Phone charger', personId: 'p1' })]
        expect(deduplicateItems(items)).toHaveLength(1)
    })

    it('removes exact duplicate items for the same person', () => {
        const items = [
            makeItem({ itemText: 'Phone charger', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: 'Phone charger', personId: 'p1', questionId: 'always-needed' }),
        ]
        expect(deduplicateItems(items)).toHaveLength(1)
    })

    it('removes duplicates that differ only in capitalisation', () => {
        const items = [
            makeItem({ itemText: 'Phone Charger', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: 'phone charger', personId: 'p1', questionId: 'always-needed' }),
        ]
        expect(deduplicateItems(items)).toHaveLength(1)
    })

    it('removes duplicates that differ in leading/trailing whitespace', () => {
        const items = [
            makeItem({ itemText: 'Day bag / Backpack', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: ' Day bag / Backpack ', personId: 'p1', questionId: 'always-needed' }),
        ]
        expect(deduplicateItems(items)).toHaveLength(1)
    })

    it('keeps the first occurrence (question-based takes precedence)', () => {
        const questionBased = makeItem({ id: 'first', itemText: 'Phone Charger', personId: 'p1', questionId: 'q1' })
        const alwaysNeeded = makeItem({ id: 'second', itemText: 'phone charger', personId: 'p1', questionId: 'always-needed' })
        const result = deduplicateItems([questionBased, alwaysNeeded])
        expect(result[0].id).toBe('first')
    })

    it('does not deduplicate the same item text across different people', () => {
        const items = [
            makeItem({ itemText: 'Phone charger', personId: 'p1' }),
            makeItem({ itemText: 'Phone charger', personId: 'p2' }),
        ]
        expect(deduplicateItems(items)).toHaveLength(2)
    })

    it('handles multiple duplicates for multiple people', () => {
        const items = [
            makeItem({ itemText: 'Daypack/Backpack', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: 'Day bag / Backpack', personId: 'p1', questionId: 'q2' }),
            makeItem({ itemText: 'Phone Charger', personId: 'p1', questionId: 'q1' }),
            makeItem({ itemText: 'phone charger', personId: 'p1', questionId: 'always-needed' }),
            makeItem({ itemText: 'Phone Charger', personId: 'p2', questionId: 'q1' }),
            makeItem({ itemText: 'phone charger', personId: 'p2', questionId: 'always-needed' }),
        ]
        // p1: Daypack/Backpack, Day bag / Backpack are different texts → kept; Phone Charger deduped → 3 items
        // p2: Phone Charger deduped → 1 item
        // total: 4
        const result = deduplicateItems(items)
        expect(result).toHaveLength(4)
    })
})
