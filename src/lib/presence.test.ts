import { describe, expect, it } from 'vitest'
import { outMax, presenceLabels } from '@/lib/presence'

describe('presenceLabels', () => {
  it('names who is counting what', () => {
    expect(
      presenceLabels([
        { userId: '1', name: 'Yuki', activity: 'cash' },
        { userId: '2', name: 'Sam', activity: 'stock' },
      ]),
    ).toEqual(['Yuki is counting cash', 'Sam is counting stock'])
  })

  it('joins two people doing the same thing', () => {
    expect(
      presenceLabels([
        { userId: '1', name: 'Yuki', activity: 'stock' },
        { userId: '2', name: 'Sam', activity: 'stock' },
      ]),
    ).toEqual(['Yuki and Sam are counting stock'])
  })

  it('skips people who are not counting', () => {
    expect(
      presenceLabels([{ userId: '1', name: 'Yuki', activity: null }]),
    ).toEqual([])
  })
})

describe('outMax', () => {
  it('keeps Out plus Left within the starting count', () => {
    expect(outMax(12, 10)).toBe(2)
    expect(outMax(12, 0)).toBe(12)
  })

  it('never goes below zero when Left is already over', () => {
    expect(outMax(12, 15)).toBe(0)
  })
})
