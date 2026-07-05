import { describe, it, expect } from 'vitest'
import { AGE_RANGE_OPTIONS, PET_SPECIES_OPTIONS, PersonSchema } from './types'

describe('AGE_RANGE_OPTIONS', () => {
  it('all option labels fit within 40 characters for mobile display', () => {
    AGE_RANGE_OPTIONS.forEach(opt => {
      expect(opt.label.length).toBeLessThanOrEqual(40)
    })
  })

  it('Toddler label still mentions pull-ups', () => {
    const toddler = AGE_RANGE_OPTIONS.find(o => o.value === 'Toddler')!
    expect(toddler.label).toContain('pull-ups')
  })

  it('Baby label still mentions nappies', () => {
    const baby = AGE_RANGE_OPTIONS.find(o => o.value === 'Baby')!
    expect(baby.label).toContain('nappies')
  })
})

describe('PET_SPECIES_OPTIONS', () => {
  it('offers dog, cat, and other', () => {
    expect(PET_SPECIES_OPTIONS.map(o => o.value)).toEqual(['dog', 'cat', 'other'])
  })

  it('all option labels fit within 40 characters for mobile display', () => {
    PET_SPECIES_OPTIONS.forEach(opt => {
      expect(opt.label.length).toBeLessThanOrEqual(40)
    })
  })
})

describe('PersonSchema - species (backward compatible)', () => {
  it('accepts a person record with a species', () => {
    const parsed = PersonSchema.parse({ id: 'p1', name: 'Rex', species: 'dog' })
    expect(parsed.species).toBe('dog')
  })

  it('accepts a legacy person record without a species', () => {
    const parsed = PersonSchema.parse({ id: 'p1', name: 'Alice', ageRange: 'Adult', gender: 'female' })
    expect(parsed.species).toBeUndefined()
  })

  it('rejects an invalid species value', () => {
    expect(() => PersonSchema.parse({ id: 'p1', name: 'X', species: 'dragon' })).toThrow()
  })
})
