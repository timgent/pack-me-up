import { describe, it, expect } from 'vitest'
import { getDogs, getCats, getPets, getHumans } from './pet-specific-items'
import { Person } from './types'

const adult: Person = { id: 'a1', name: 'Alice', ageRange: 'Adult' }
const baby: Person = { id: 'b1', name: 'Baby', ageRange: 'Baby' }
const dog: Person = { id: 'd1', name: 'Rex', species: 'dog' }
const dog2: Person = { id: 'd2', name: 'Fido', species: 'dog' }
const cat: Person = { id: 'c1', name: 'Whiskers', species: 'cat' }
const other: Person = { id: 'o1', name: 'Hoppy', species: 'other' }

const all = [adult, baby, dog, dog2, cat, other]

describe('getDogs', () => {
    it('returns only people with species dog', () => {
        expect(getDogs(all).map(p => p.id)).toEqual(['d1', 'd2'])
    })

    it('ignores humans and other species', () => {
        expect(getDogs([adult, cat, other])).toEqual([])
    })
})

describe('getCats', () => {
    it('returns only people with species cat', () => {
        expect(getCats(all).map(p => p.id)).toEqual(['c1'])
    })

    it('ignores humans and other species', () => {
        expect(getCats([adult, dog, other])).toEqual([])
    })
})

describe('getPets', () => {
    it('returns everyone with a species set (any pet)', () => {
        expect(getPets(all).map(p => p.id)).toEqual(['d1', 'd2', 'c1', 'o1'])
    })

    it('excludes humans (no species)', () => {
        expect(getPets([adult, baby])).toEqual([])
    })
})

describe('getHumans', () => {
    it('returns only people without a species', () => {
        expect(getHumans(all).map(p => p.id)).toEqual(['a1', 'b1'])
    })

    it('returns everyone when there are no pets', () => {
        expect(getHumans([adult, baby]).map(p => p.id)).toEqual(['a1', 'b1'])
    })

    it('returns empty array for a pets-only group', () => {
        expect(getHumans([dog, cat])).toEqual([])
    })
})
