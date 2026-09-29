import { describe, expect, it } from 'vitest'
import {
  canFinish,
  overShortLabel,
  overShortStatus,
  soldLabel,
} from '@/lib/count-up'

describe('overShortStatus', () => {
  const at = (cents: number) => overShortStatus(cents, 300, 1000)

  it('is ok within the first threshold, either way', () => {
    expect(at(0)).toBe('ok')
    expect(at(300)).toBe('ok')
    expect(at(-300)).toBe('ok')
  })

  it('warns within the second threshold', () => {
    expect(at(301)).toBe('warn')
    expect(at(-1000)).toBe('warn')
  })

  it('is bad beyond that', () => {
    expect(at(1001)).toBe('bad')
    expect(at(-1300)).toBe('bad')
  })
})

describe('overShortLabel', () => {
  it('says which way the cash is off', () => {
    expect(overShortLabel(0)).toBe('Spot on')
    expect(overShortLabel(1300)).toBe('Over $13.00')
    expect(overShortLabel(-700)).toBe('Short $7.00')
  })
})

describe('soldLabel', () => {
  it('shows pieces and dollars for single items', () => {
    expect(soldLabel(20, 1, 2000)).toBe('Sold 20 · $20.00')
  })

  it('shows deals for deal items', () => {
    expect(soldLabel(24, 2, 1200)).toBe('Sold 24 pcs = 12 deals · $12.00')
  })

  it('shows fractional deals plainly', () => {
    expect(soldLabel(5, 2, 250)).toBe('Sold 5 pcs = 2.5 deals · $2.50')
  })
})

describe('canFinish', () => {
  it('needs a sign-off and no item over its start', () => {
    expect(
      canFinish({ signoffs: 1, itemsOverStart: 0, itemsUncounted: 0 }),
    ).toBe(true)
    expect(
      canFinish({ signoffs: 0, itemsOverStart: 0, itemsUncounted: 0 }),
    ).toBe(false)
    expect(
      canFinish({ signoffs: 2, itemsOverStart: 1, itemsUncounted: 0 }),
    ).toBe(false)
    expect(
      canFinish({ signoffs: 2, itemsOverStart: 0, itemsUncounted: 1 }),
    ).toBe(false)
  })
})
