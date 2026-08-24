import { describe, it, expect, vi, beforeEach } from 'vitest'
import { duplicatePackingList, duplicateDroppedFields } from './duplicatePackingList'
import { fullyPopulatedPackingList } from '../test-utils/fullyPopulatedFixtures'
import type { PackingList } from '../create-packing-list/types'

vi.mock('./uuid', () => {
    let n = 0
    return { generateUUID: vi.fn(() => `uuid-${++n}`) }
})

const original: PackingList = { ...fullyPopulatedPackingList, _rev: '3-abcdef' }

/**
 * Every field of `PackingList`, split by what a duplicate does with it. The
 * three lists below have to add up to the whole type — the last test in this
 * file asserts exactly that against the fully populated fixture, so adding a
 * field to `PackingList` fails here until someone has decided what duplicating
 * should do with it.
 */
const regeneratedFields = ['id', 'name', 'createdAt', 'lastModified', 'items'] as const
const carriedFields = [
    'nights', 'destination', 'deletedItems', 'guests', 'questionAnswers', 'selectedPeopleIds',
] as const

describe('duplicatePackingList', () => {
    beforeEach(() => vi.clearAllMocks())

    it('carries the trip context over instead of listing fields to keep', () => {
        const copy = duplicatePackingList(original, [original.name])

        for (const field of carriedFields) {
            expect({ [field]: copy[field] }).toEqual({ [field]: original[field] })
        }
    })

    it('gives the copy its own identity, a fresh name and fresh timestamps', () => {
        const before = Date.now()
        const copy = duplicatePackingList(original, [original.name])

        expect(copy.id).not.toBe(original.id)
        expect(copy.name).toBe('Fully populated trip (again!)')
        expect(new Date(copy.createdAt).getTime()).toBeGreaterThanOrEqual(before)
        expect(copy.lastModified).toBe(copy.createdAt)
    })

    it('starts every item unpacked and under a new id', () => {
        const copy = duplicatePackingList(original, [])

        expect(copy.items).toHaveLength(original.items.length)
        copy.items.forEach((item, i) => {
            expect(item.id).not.toBe(original.items[i].id)
            expect(item.packed).toBe(false)
            expect(item.itemText).toBe(original.items[i].itemText)
        })
    })

    // A repeat trip is next year's, not last year's: keeping the dates would
    // date-stamp the copy with a trip that has already happened.
    it('clears the trip dates', () => {
        const copy = duplicatePackingList(original, [])

        expect(copy.startDate).toBeUndefined()
        expect(copy.endDate).toBeUndefined()
    })

    // Duplicate is offered on cached copies of other people's shared lists too.
    it('produces a list of your own from a cached copy of a shared list', () => {
        const copy = duplicatePackingList(original, [])

        expect(copy.sharedFromPodUrl).toBeUndefined()
        expect(copy.ownerWebId).toBeUndefined()
        expect('sharedFromPodUrl' in copy).toBe(false)
        expect('ownerWebId' in copy).toBe(false)
    })

    it('does not carry the original document revision', () => {
        const copy = duplicatePackingList(original, [])

        expect('_rev' in copy).toBe(false)
    })

    it('leaves the original untouched', () => {
        const snapshot = structuredClone(original)
        duplicatePackingList(original, [])

        expect(original).toEqual(snapshot)
    })

    it('carries a field the caller knows nothing about', () => {
        const withFutureField = { ...original, someFutureField: 'keep me' } as PackingList

        const copy = duplicatePackingList(withFutureField, []) as PackingList & { someFutureField?: string }

        expect(copy.someFutureField).toBe('keep me')
    })

    // The guard: `fullyPopulatedPackingList` is `Required<...>`, so a new field
    // on the type has to appear there, and then here.
    it('accounts for every field of PackingList', () => {
        const accountedFor = new Set<string>([
            ...regeneratedFields,
            ...carriedFields,
            ...duplicateDroppedFields,
        ])

        const unaccounted = Object.keys(original).filter(field => !accountedFor.has(field))

        expect(unaccounted).toEqual([])
    })
})
