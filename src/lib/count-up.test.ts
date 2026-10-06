import { describe, expect, it } from 'vitest'
import {
  canFinish,
  countErrorMessage,
  countSyncStatus,
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

describe('countErrorMessage', () => {
  it('words a dropped connection plainly', () => {
    expect(countErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'No connection. Change not saved.',
    )
    expect(countErrorMessage({ message: 'Load failed' })).toBe(
      'No connection. Change not saved.',
    )
  })

  it('passes a database refusal through as-is', () => {
    expect(countErrorMessage({ message: 'Sale day is closed' })).toBe(
      'Sale day is closed',
    )
  })
})

describe('countSyncStatus', () => {
  const write = (
    status: 'pending' | 'success' | 'error',
    scope: string,
    submittedAt: number,
  ) => ({ options: { scope: { id: scope } }, state: { status, submittedAt } })

  it('is saved with nothing written', () => {
    expect(countSyncStatus([])).toBe('saved')
  })

  it('is saving while any write is in flight', () => {
    expect(
      countSyncStatus([write('error', 'a', 1), write('pending', 'b', 2)]),
    ).toBe('saving')
  })

  it('is failed until the same row saves again', () => {
    expect(countSyncStatus([write('error', 'a', 1)])).toBe('failed')
    expect(
      countSyncStatus([write('error', 'a', 1), write('success', 'b', 2)]),
    ).toBe('failed')
    expect(
      countSyncStatus([write('error', 'a', 1), write('success', 'a', 2)]),
    ).toBe('saved')
  })
})
