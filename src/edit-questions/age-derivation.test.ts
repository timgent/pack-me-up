import { describe, it, expect } from 'vitest'
import { deriveAgeRange, currentAgeRange, detectAgeTransitions } from './age-derivation'
import { Person } from './types'

const TODAY = new Date('2026-07-18T12:00:00Z')

describe('deriveAgeRange', () => {
    it('returns Baby for under 1', () => {
        expect(deriveAgeRange('2026-01-10', TODAY)).toBe('Baby')
        expect(deriveAgeRange('2025-07-19', TODAY)).toBe('Baby') // 1st birthday tomorrow
    })

    it('returns Toddler from 1st birthday up to 3rd', () => {
        expect(deriveAgeRange('2025-07-18', TODAY)).toBe('Toddler') // 1st birthday today
        expect(deriveAgeRange('2023-07-19', TODAY)).toBe('Toddler') // 3rd birthday tomorrow
    })

    it('returns Child from 3rd birthday up to 12th', () => {
        expect(deriveAgeRange('2023-07-18', TODAY)).toBe('Child') // 3rd birthday today
        expect(deriveAgeRange('2014-07-19', TODAY)).toBe('Child') // 12th birthday tomorrow
    })

    it('returns Teenager from 12th birthday up to 18th', () => {
        expect(deriveAgeRange('2014-07-18', TODAY)).toBe('Teenager') // 12th birthday today
        expect(deriveAgeRange('2008-07-19', TODAY)).toBe('Teenager') // 18th birthday tomorrow
    })

    it('returns Adult from 18th birthday', () => {
        expect(deriveAgeRange('2008-07-18', TODAY)).toBe('Adult') // 18th birthday today
        expect(deriveAgeRange('1985-03-02', TODAY)).toBe('Adult')
    })

    it('handles a Feb 29 birthday in non-leap years (birthday counts from Mar 1)', () => {
        // Born 2024-02-29; on 2027-02-28 they are still 2, on 2027-03-01 they turn 3
        expect(deriveAgeRange('2024-02-29', new Date('2027-02-28T12:00:00Z'))).toBe('Toddler')
        expect(deriveAgeRange('2024-02-29', new Date('2027-03-01T12:00:00Z'))).toBe('Child')
    })

    it('returns undefined for invalid or future dates', () => {
        expect(deriveAgeRange('not-a-date', TODAY)).toBeUndefined()
        expect(deriveAgeRange('', TODAY)).toBeUndefined()
        expect(deriveAgeRange('2030-01-01', TODAY)).toBeUndefined()
    })
})

function person(overrides: Partial<Person>): Person {
    return { id: crypto.randomUUID(), name: 'Test', ...overrides }
}

describe('currentAgeRange', () => {
    it('derives from dateOfBirth when present', () => {
        const p = person({ ageRange: 'Toddler', dateOfBirth: '2020-01-01' })
        expect(currentAgeRange(p, TODAY)).toBe('Child')
    })

    it('falls back to stored ageRange without dateOfBirth', () => {
        expect(currentAgeRange(person({ ageRange: 'Teenager' }), TODAY)).toBe('Teenager')
    })

    it('falls back to stored ageRange when dateOfBirth is invalid', () => {
        const p = person({ ageRange: 'Child', dateOfBirth: 'garbage' })
        expect(currentAgeRange(p, TODAY)).toBe('Child')
    })

    it('returns undefined when neither is available', () => {
        expect(currentAgeRange(person({}), TODAY)).toBeUndefined()
    })
})

describe('detectAgeTransitions', () => {
    it('reports people whose derived bracket differs from the stored one', () => {
        const kid = person({ name: 'Neve', ageRange: 'Toddler', dateOfBirth: '2022-06-01' })
        const transitions = detectAgeTransitions([kid], TODAY)
        expect(transitions).toEqual([{ person: kid, from: 'Toddler', to: 'Child' }])
    })

    it('reports people with a dateOfBirth but no stored bracket yet', () => {
        const kid = person({ name: 'Leo', dateOfBirth: '2024-01-01' })
        expect(detectAgeTransitions([kid], TODAY)).toEqual([{ person: kid, from: undefined, to: 'Toddler' }])
    })

    it('never suggests a downward move when the stored bracket is ahead of the derived one', () => {
        // Manually promoted early — derived says Child, parent already set Teenager
        const early = person({ name: 'Sam', ageRange: 'Teenager', dateOfBirth: '2020-01-01' })
        expect(detectAgeTransitions([early], TODAY)).toEqual([])
    })

    it('ignores people whose brackets match, without a DOB, pets, and deleted people', () => {
        const matching = person({ ageRange: 'Child', dateOfBirth: '2020-01-01' })
        const noDob = person({ ageRange: 'Toddler' })
        const pet = person({ species: 'dog', dateOfBirth: '2020-01-01' })
        const deleted = person({ ageRange: 'Toddler', dateOfBirth: '2020-01-01', deletedAt: '2026-01-01T00:00:00Z' })
        expect(detectAgeTransitions([matching, noDob, pet, deleted], TODAY)).toEqual([])
    })
})
