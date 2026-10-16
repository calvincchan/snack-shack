import { describe, expect, it } from 'vitest'
import { lastCountedLine, stockLine } from '@/lib/items'

describe('stockLine', () => {
  it('says what was bought since the count', () => {
    expect(
      stockLine({
        lastCountedAt: '2026-10-01T18:00:00Z',
        lastCountedPieces: 24,
        boughtSince: 48,
        repackedSince: 0,
      }),
    ).toBe('Counted 24 on Oct 1 · then bought 48')
  })

  it('says only the count when nothing happened since', () => {
    expect(
      stockLine({
        lastCountedAt: '2026-10-01T18:00:00Z',
        lastCountedPieces: 24,
        boughtSince: 0,
        repackedSince: 0,
      }),
    ).toBe('Counted 24 on Oct 1')
  })

  it('says made for a pack item', () => {
    expect(
      stockLine({
        lastCountedAt: '2026-10-01T18:00:00Z',
        lastCountedPieces: 2,
        boughtSince: 0,
        repackedSince: 5,
      }),
    ).toBe('Counted 2 on Oct 1 · then made 5')
  })

  it('names pieces that went into packs', () => {
    expect(
      stockLine({
        lastCountedAt: '2026-10-01T18:00:00Z',
        lastCountedPieces: 95,
        boughtSince: 48,
        repackedSince: -155,
      }),
    ).toBe('Counted 95 on Oct 1 · then bought 48, 155 into packs')
  })

  it('says returned when refunds outweigh purchases', () => {
    expect(
      stockLine({
        lastCountedAt: '2026-10-01T18:00:00Z',
        lastCountedPieces: 24,
        boughtSince: -12,
        repackedSince: 0,
      }),
    ).toBe('Counted 24 on Oct 1 · then returned 12')
  })

  it('says so when an item was never counted', () => {
    expect(
      stockLine({
        lastCountedAt: null,
        lastCountedPieces: null,
        boughtSince: 48,
        repackedSince: 0,
      }),
    ).toBe('Not counted · bought 48')
  })

  it('leaves out then when never counted', () => {
    expect(
      stockLine({
        lastCountedAt: null,
        lastCountedPieces: null,
        boughtSince: 250,
        repackedSince: -155,
      }),
    ).toBe('Not counted · bought 250, 155 into packs')
  })

  it('says made for a pack item never counted', () => {
    expect(
      stockLine({
        lastCountedAt: null,
        lastCountedPieces: null,
        boughtSince: 0,
        repackedSince: 31,
      }),
    ).toBe('Not counted · made 31')
  })

  it('says just not counted when nothing happened', () => {
    expect(
      stockLine({
        lastCountedAt: null,
        lastCountedPieces: null,
        boughtSince: 0,
        repackedSince: 0,
      }),
    ).toBe('Not counted')
  })
})

describe('lastCountedLine', () => {
  it('is null for an uncounted item', () => {
    expect(
      lastCountedLine({ lastCountedAt: null, lastCountedPieces: null }),
    ).toBeNull()
  })
})
