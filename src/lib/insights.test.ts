import { describe, expect, it } from 'vitest'
import { monthLabel, sentences, signedCents, type Rules } from '@/lib/insights'

const quiet: Rules = {
  bestMonth: null,
  trend: null,
  openCountOff: null,
  slowest: null,
  lowMargin: { names: [] },
}

describe('sentences', () => {
  it('says nothing when no rule applies', () => {
    expect(sentences(quiet)).toEqual([])
  })

  it('words the revenue trend both ways', () => {
    expect(
      sentences({
        ...quiet,
        trend: { differenceCents: 1200, usualCents: 8500 },
      }),
    ).toEqual(['Revenue $12.00 above the usual $85.00.'])
    expect(
      sentences({
        ...quiet,
        trend: { differenceCents: -3600, usualCents: 9600 },
      }),
    ).toEqual(['Revenue $36.00 below the usual $96.00.'])
  })

  it('names the best month and the open count warning', () => {
    const out = sentences({
      ...quiet,
      bestMonth: { month: '2026-09-01' },
      openCountOff: { saleDays: 1 },
    })
    expect(out[0]).toBe('September left the most after claims.')
    expect(out[1]).toContain('1 sale day opened')
    expect(out[1]).toContain('Check the box between sale days.')
  })

  it('lists the slowest item and low margin stock', () => {
    const out = sentences({
      ...quiet,
      slowest: { name: 'Pretzels' },
      lowMargin: { names: ['Pocky', 'Gum'] },
    })
    expect(out).toEqual([
      'Pretzels moved the slowest. Try a lower price on the Items tab.',
      'Low margin and restocked since the last count: Pocky, Gum.',
    ])
  })
})

describe('formatting', () => {
  it('signs differences', () => {
    expect(signedCents(1500)).toBe('+$15.00')
    expect(signedCents(-350)).toBe('−$3.50')
    expect(signedCents(0)).toBe('$0.00')
  })

  it('labels a month without a time zone shift', () => {
    expect(monthLabel('2026-10-01')).toBe('Oct 2026')
  })
})
