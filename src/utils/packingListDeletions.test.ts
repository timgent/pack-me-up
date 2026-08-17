import { describe, it, expect } from 'vitest'
import {
    DELETION_RETENTION_DAYS,
    deletionsById,
    emptyDeletedPackingLists,
    isNewerThanDeletion,
    mergeDeletedPackingLists,
    pruneDeletions,
    registriesEqual,
    withDeletion,
    withoutDeletion,
} from './packingListDeletions'
import type { DeletedPackingLists } from '../services/rdfSerialization'

const EARLY = '2026-01-01T10:00:00.000Z'
const LATE = '2026-01-02T10:00:00.000Z'

function registry(
    deletions: Array<[string, string]>,
    lastModified = LATE
): DeletedPackingLists {
    return { deletions: deletions.map(([listId, deletedAt]) => ({ listId, deletedAt })), lastModified }
}

describe('emptyDeletedPackingLists', () => {
    it('starts with no tombstones and a timestamp any pod copy beats', () => {
        const empty = emptyDeletedPackingLists()
        expect(empty.deletions).toEqual([])
        expect(new Date(empty.lastModified).getTime()).toBe(0)
    })
})

describe('mergeDeletedPackingLists', () => {
    it('keeps tombstones from both sides', () => {
        const merged = mergeDeletedPackingLists(registry([['a', EARLY]]), registry([['b', EARLY]]))
        expect(deletionsById(merged)).toEqual(new Map([['a', EARLY], ['b', EARLY]]))
    })

    it('keeps the later time when both sides know the same list', () => {
        const merged = mergeDeletedPackingLists(registry([['a', EARLY]]), registry([['a', LATE]]))
        expect(merged.deletions).toEqual([{ listId: 'a', deletedAt: LATE }])
    })

    it('is order-independent', () => {
        const a = registry([['a', EARLY], ['b', LATE]])
        const b = registry([['a', LATE], ['c', EARLY]])
        expect(mergeDeletedPackingLists(a, b).deletions).toEqual(mergeDeletedPackingLists(b, a).deletions)
    })

    it('takes the later lastModified of the two registries', () => {
        const merged = mergeDeletedPackingLists(registry([], EARLY), registry([], LATE))
        expect(merged.lastModified).toBe(LATE)
    })

    // Two devices each deleting a different list offline is exactly the case a
    // last-writer-wins whole-file merge would get wrong.
    it('loses neither deletion when two devices delete different lists offline', () => {
        const deviceA = withDeletion(emptyDeletedPackingLists(), 'holiday', EARLY)
        const deviceB = withDeletion(emptyDeletedPackingLists(), 'ski-trip', LATE)
        const merged = mergeDeletedPackingLists(deviceA, deviceB)
        expect(merged.deletions.map(d => d.listId).sort()).toEqual(['holiday', 'ski-trip'])
    })
})

describe('withDeletion', () => {
    it('adds a tombstone', () => {
        const result = withDeletion(emptyDeletedPackingLists(), 'a', EARLY)
        expect(result.deletions).toEqual([{ listId: 'a', deletedAt: EARLY }])
        expect(result.lastModified).toBe(EARLY)
    })

    it('moves an existing tombstone forward, never back', () => {
        const result = withDeletion(registry([['a', LATE]]), 'a', EARLY)
        expect(result.deletions).toEqual([{ listId: 'a', deletedAt: LATE }])
    })
})

describe('withoutDeletion', () => {
    it('drops the tombstone and stamps the registry', () => {
        const result = withoutDeletion(registry([['a', EARLY], ['b', EARLY]]), 'a', LATE)
        expect(result.deletions).toEqual([{ listId: 'b', deletedAt: EARLY }])
        expect(result.lastModified).toBe(LATE)
    })

    it('leaves the registry untouched when there is no such tombstone', () => {
        const before = registry([['a', EARLY]])
        expect(withoutDeletion(before, 'b')).toBe(before)
    })
})

describe('pruneDeletions', () => {
    const now = new Date('2026-06-01T00:00:00.000Z').getTime()
    const day = 24 * 60 * 60 * 1000

    it('keeps tombstones inside the retention window', () => {
        const recent = new Date(now - 10 * day).toISOString()
        expect(pruneDeletions(registry([['a', recent]]), now).deletions).toHaveLength(1)
    })

    it('drops tombstones past the retention window', () => {
        const ancient = new Date(now - (DELETION_RETENTION_DAYS + 1) * day).toISOString()
        expect(pruneDeletions(registry([['a', ancient]]), now).deletions).toEqual([])
    })

    it('returns the same object when nothing is pruned', () => {
        const before = registry([['a', new Date(now - day).toISOString()]])
        expect(pruneDeletions(before, now)).toBe(before)
    })
})

describe('isNewerThanDeletion', () => {
    it('is true for a list edited after it was deleted', () => {
        expect(isNewerThanDeletion({ lastModified: LATE }, EARLY)).toBe(true)
    })

    it('is false for a list last touched before it was deleted', () => {
        expect(isNewerThanDeletion({ lastModified: EARLY }, LATE)).toBe(false)
    })

    it('is false at exactly the deletion time — the delete came last', () => {
        expect(isNewerThanDeletion({ lastModified: EARLY }, EARLY)).toBe(false)
    })

    it('is false for a list with no timestamp to make the claim with', () => {
        expect(isNewerThanDeletion({}, EARLY)).toBe(false)
    })
})

describe('registriesEqual', () => {
    it('ignores ordering and the registry timestamp', () => {
        expect(registriesEqual(
            registry([['a', EARLY], ['b', LATE]], EARLY),
            registry([['b', LATE], ['a', EARLY]], LATE),
        )).toBe(true)
    })

    it('is false when a tombstone differs', () => {
        expect(registriesEqual(registry([['a', EARLY]]), registry([['a', LATE]]))).toBe(false)
        expect(registriesEqual(registry([['a', EARLY]]), registry([]))).toBe(false)
    })
})
