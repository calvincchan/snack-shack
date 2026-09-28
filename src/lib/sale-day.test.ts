import { describe, expect, it } from 'vitest'
import { differenceLabel, stepIndex } from '@/lib/sale-day'

describe('stepIndex', () => {
  it('splits the lineup phase into Lineup and Check stock', () => {
    expect(stepIndex('lineup', false)).toBe(0)
    expect(stepIndex('lineup', true)).toBe(1)
  })

  it('follows the phase once the sale has started', () => {
    expect(stepIndex('selling', false)).toBe(2)
    expect(stepIndex('counting', false)).toBe(3)
    expect(stepIndex('closed', false)).toBe(3)
  })
})

describe('differenceLabel', () => {
  const at = (qty: number, reason: string) =>
    differenceLabel({ id: '1', name: 'Mini bars', qty, reason })

  it('says what was reported before the sale', () => {
    expect(at(-2, 'damaged')).toBe('2 damaged (Mini bars)')
    expect(at(-1, 'missing')).toBe('1 missing (Mini bars)')
    expect(at(3, 'found')).toBe('3 extra found (Mini bars)')
  })
})
