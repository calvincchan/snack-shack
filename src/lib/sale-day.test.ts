import { describe, expect, it } from 'vitest'
import { differenceLabel, floatToSend, stepIndex } from '@/lib/sale-day'

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

describe('floatToSend', () => {
  it('sends nothing when the box matches the setting', () => {
    expect(floatToSend(3000, 3000)).toBeNull()
  })

  it('sends nothing when the float was not touched', () => {
    expect(floatToSend(null, 3000)).toBeNull()
  })

  it('sends the counted amount in cents when it differs', () => {
    expect(floatToSend(2500, 3000)).toBe(2500)
    expect(floatToSend(0, 3000)).toBe(0)
  })
})
