import { describe, expect, it } from 'vitest'
import {
  countErrorMessage,
  countSyncStatus,
  openDiffLabel,
} from '@/lib/sale-day'
import { formatCents } from '@/lib/money'

describe('openDiffLabel', () => {
  it('says nothing when the box matches or there is nothing to compare', () => {
    expect(openDiffLabel(0, formatCents)).toBeNull()
    expect(openDiffLabel(null, formatCents)).toBeNull()
  })

  it('says which way the box is off', () => {
    expect(openDiffLabel(-200, formatCents)).toBe(
      '$2.00 less than left last time',
    )
    expect(openDiffLabel(525, formatCents)).toBe(
      '$5.25 more than left last time',
    )
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
    expect(countErrorMessage({ message: 'This sale day is closed.' })).toBe(
      'This sale day is closed.',
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
