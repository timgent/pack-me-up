import { describe, it, expect } from 'vitest'
import { AGE_RANGE_OPTIONS, PET_SPECIES_OPTIONS, PersonSchema, ItemSchema, renumberItemOrder } from './types'

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

describe('ItemSchema - order (backward compatible)', () => {
  it('accepts an item with an order', () => {
    const parsed = ItemSchema.parse({ text: 'Towel', personSelections: [], order: 3 })
    expect(parsed.order).toBe(3)
  })

  it('accepts a legacy item without an order', () => {
    const parsed = ItemSchema.parse({ text: 'Towel', personSelections: [] })
    expect(parsed.order).toBeUndefined()
  })
})

describe('renumberItemOrder', () => {
  const now = '2024-06-01T00:00:00.000Z'

  it('stamps sequential order and lastModified on items whose position changed', () => {
    const items = [
      { text: 'B', personSelections: [], order: 1, lastModified: '2024-01-01T00:00:00.000Z' },
      { text: 'A', personSelections: [], order: 0, lastModified: '2024-01-01T00:00:00.000Z' },
    ]
    const result = renumberItemOrder(items, now)
    expect(result.map(i => i.order)).toEqual([0, 1])
    expect(result.every(i => i.lastModified === now)).toBe(true)
  })

  it('leaves untouched items alone so sync LWW does not see phantom edits', () => {
    const items = [
      { text: 'A', personSelections: [], order: 0, lastModified: '2024-01-01T00:00:00.000Z' },
      { text: 'B', personSelections: [], order: 1, lastModified: '2024-01-01T00:00:00.000Z' },
    ]
    const result = renumberItemOrder(items, now)
    expect(result[0].lastModified).toBe('2024-01-01T00:00:00.000Z')
    expect(result[1].lastModified).toBe('2024-01-01T00:00:00.000Z')
  })

  it('stamps order on legacy items that had none', () => {
    const items = [{ text: 'A', personSelections: [] }]
    const result = renumberItemOrder(items, now)
    expect(result[0].order).toBe(0)
    expect(result[0].lastModified).toBe(now)
  })
})
