import { describe, it, expect } from 'vitest'
import { duplicateListName } from './duplicateListName'

describe('duplicateListName', () => {
    it('names a duplicate after the trip it repeats', () => {
        expect(duplicateListName('Cornwall', ['Cornwall'])).toBe('Cornwall (again!)')
    })

    it('does not collide with a duplicate that is already there', () => {
        expect(duplicateListName('Cornwall', ['Cornwall', 'Cornwall (again!)']))
            .toBe('Cornwall (again! ×2)')
    })

    it('keeps counting up rather than reusing a taken name', () => {
        expect(duplicateListName('Cornwall', ['Cornwall', 'Cornwall (again!)', 'Cornwall (again! ×2)']))
            .toBe('Cornwall (again! ×3)')
    })

    // Otherwise the fourth Cornwall trip is "Cornwall (again!) (again!) (again!)".
    it('counts up from the original trip name when duplicating a duplicate', () => {
        expect(duplicateListName('Cornwall (again!)', ['Cornwall', 'Cornwall (again!)']))
            .toBe('Cornwall (again! ×2)')
    })

    it('counts up from a numbered duplicate too', () => {
        expect(duplicateListName('Cornwall (again! ×2)', ['Cornwall (again!)', 'Cornwall (again! ×2)']))
            .toBe('Cornwall (again! ×3)')
    })

    // "cornwall (again!)" and "Cornwall (again!)" are the same name to a person
    // scanning their lists, whatever the string comparison says.
    it('treats names that differ only in case or padding as taken', () => {
        expect(duplicateListName('Cornwall', ['  cornwall (AGAIN!)  ']))
            .toBe('Cornwall (again! ×2)')
    })

    it('trims the name it builds on', () => {
        expect(duplicateListName('  Cornwall  ', [])).toBe('Cornwall (again!)')
    })

    it('still produces a usable name when the original has none', () => {
        expect(duplicateListName('   ', [])).toBe('Packing list (again!)')
    })

    it('leaves a name that merely mentions again alone', () => {
        expect(duplicateListName('Never again', [])).toBe('Never again (again!)')
    })
})
