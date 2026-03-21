import { describe, it, expect } from 'vitest'
import { AGE_RANGE_OPTIONS } from './types'

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
