import { describe, it, expect } from 'vitest'
import {
    getFemale,
    getMale,
    getFemaleTeenagersAndAdults,
    getMaleTeenagersAndAdults,
} from './age-specific-items'
import { Person } from './types'

const female: Person = { id: 'f1', name: 'Alice', ageRange: 'Adult', gender: 'female' }
const male: Person = { id: 'm1', name: 'Bob', ageRange: 'Adult', gender: 'male' }
const other: Person = { id: 'o1', name: 'Casey', ageRange: 'Adult', gender: 'other' }
const noGender: Person = { id: 'n1', name: 'Dana', ageRange: 'Adult' }
const femaleTeenager: Person = { id: 'f2', name: 'Eve', ageRange: 'Teenager', gender: 'female' }
const maleChild: Person = { id: 'm2', name: 'Frank', ageRange: 'Child', gender: 'male' }
const femaleBaby: Person = { id: 'f3', name: 'Grace', ageRange: 'Baby', gender: 'female' }

const all = [female, male, other, noGender, femaleTeenager, maleChild, femaleBaby]

describe('getFemale', () => {
    it('returns only people with gender female', () => {
        expect(getFemale(all).map(p => p.id)).toEqual(['f1', 'f2', 'f3'])
    })

    it('returns empty array when no female people', () => {
        expect(getFemale([male, noGender])).toEqual([])
    })
})

describe('getMale', () => {
    it('returns only people with gender male', () => {
        expect(getMale(all).map(p => p.id)).toEqual(['m1', 'm2'])
    })

    it('returns empty array when no male people', () => {
        expect(getMale([female, noGender])).toEqual([])
    })
})

describe('getFemaleTeenagersAndAdults', () => {
    it('returns female teenagers and adults only', () => {
        expect(getFemaleTeenagersAndAdults(all).map(p => p.id)).toEqual(['f1', 'f2'])
    })

    it('excludes female babies and children', () => {
        const result = getFemaleTeenagersAndAdults([femaleBaby, femaleTeenager, female])
        expect(result.map(p => p.id)).toEqual(['f2', 'f1'])
    })

    it('returns empty array when no matching people', () => {
        expect(getFemaleTeenagersAndAdults([male, maleChild])).toEqual([])
    })
})

describe('getMaleTeenagersAndAdults', () => {
    it('returns male teenagers and adults only', () => {
        expect(getMaleTeenagersAndAdults(all).map(p => p.id)).toEqual(['m1'])
    })

    it('excludes male children', () => {
        expect(getMaleTeenagersAndAdults([maleChild, male])).toEqual([male])
    })

    it('returns empty array when no matching people', () => {
        expect(getMaleTeenagersAndAdults([female, femaleTeenager])).toEqual([])
    })
})
