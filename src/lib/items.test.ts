import { describe, expect, it } from 'vitest'
import { lastCountedLine, stockLine } from '@/lib/items'

describe('stockLine', () => {
  it('says what was counted and bought since', () => {
    expect(
      stockLine({
        lastCountedAt: '2026-10-01T18:00:00Z',
        lastCountedPieces: 24,
        boughtSince: 48,
      }),
    ).toBe('Counted 24 on Oct 1 · bought 48 since')
  })

  it('says so when an item was never counted', () => {
    expect(
      stockLine({
        lastCountedAt: null,
        lastCountedPieces: null,
        boughtSince: 48,
      }),
    ).toBe('Not counted · bought 48')
  })
})

describe('lastCountedLine', () => {
  it('is null for an uncounted item', () => {
    expect(
      lastCountedLine({ lastCountedAt: null, lastCountedPieces: null }),
    ).toBeNull()
  })
})

describe('stockLine with repacks', () => {
  it('adds repacked pieces used', () => {
    expect(
      stockLine({
        lastCountedAt: null,
        lastCountedPieces: null,
        boughtSince: 250,
        repackedSince: -155,
      }),
    ).toBe('Not counted · bought 250 · repacked −155')
  })

  it('adds repacked pieces made', () => {
    expect(
      stockLine({
        lastCountedAt: '2026-10-01T18:00:00Z',
        lastCountedPieces: 0,
        boughtSince: 0,
        repackedSince: 31,
      }),
    ).toBe('Counted 0 on Oct 1 · bought 0 since · repacked +31')
  })
})
