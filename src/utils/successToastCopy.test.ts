import { describe, it, expect, beforeEach } from 'vitest'
import { SUCCESS_TOAST_VARIANTS, successToast, resetSuccessToastVariety, type SuccessToastKey } from './successToastCopy'

const keys = Object.keys(SUCCESS_TOAST_VARIANTS) as SuccessToastKey[]

describe('successToast', () => {
    beforeEach(() => {
        resetSuccessToastVariety()
    })

    it.each(keys)('returns one of the variants for %s', key => {
        expect(SUCCESS_TOAST_VARIANTS[key]).toContain(successToast(key))
    })

    // The point of the whole module: doing the same thing twice should not
    // produce the same sentence twice, or the second one goes unread.
    it.each(keys)('never repeats itself twice in a row for %s', key => {
        let previous = successToast(key)
        for (let i = 0; i < 50; i++) {
            const next = successToast(key)
            expect(next).not.toBe(previous)
            previous = next
        }
    })

    it('tracks what was last said per action, so one action does not silence another', () => {
        const first = successToast('backupCreated')
        successToast('backupRestored')
        // The backupRestored call must not have cleared backupCreated's memory.
        expect(successToast('backupCreated')).not.toBe(first)
    })

    it.each(keys)('eventually uses every variant of %s, so no copy is dead weight', key => {
        const seen = new Set<string>()
        for (let i = 0; i < 500; i++) seen.add(successToast(key))
        expect(seen.size).toBe(SUCCESS_TOAST_VARIANTS[key].length)
    })

    // With only one variant there is nothing to vary, and the no-repeat rule
    // above would be unsatisfiable.
    it.each(keys)('offers at least two variants for %s', key => {
        expect(SUCCESS_TOAST_VARIANTS[key].length).toBeGreaterThanOrEqual(2)
    })

    // Toasts sit in a fixed-width box on a 390px phone; a long sentence wraps
    // to a paragraph and pushes the dismiss button off the edge.
    it.each(keys)('keeps every variant of %s short enough for a narrow phone', key => {
        for (const variant of SUCCESS_TOAST_VARIANTS[key]) {
            expect(variant.length).toBeLessThanOrEqual(48)
        }
    })
})
