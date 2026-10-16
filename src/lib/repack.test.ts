import { describe, expect, it } from 'vitest'
import { costPerPackCents, repackMoves, repackedMessage } from '@/lib/repack'

const items = [
  { id: 'peach', costPerPieceCents: 4.2 },
  { id: 'keys', costPerPieceCents: 18 },
]

describe('costPerPackCents', () => {
  it('adds up the pieces in one pack', () => {
    expect(
      costPerPackCents(
        [
          { itemId: 'peach', perPack: 5 },
          { itemId: 'keys', perPack: 1 },
        ],
        items,
      ),
    ).toBeCloseTo(39)
  })

  it('works for a pack of one item', () => {
    expect(costPerPackCents([{ itemId: 'keys', perPack: 4 }], items)).toBe(72)
  })

  it('is zero with nothing in the pack', () => {
    expect(costPerPackCents([], items)).toBe(0)
  })
})

describe('repackMoves', () => {
  it('takes packs × pieces per pack from each item', () => {
    expect(
      repackMoves(
        [
          { itemId: 'peach', perPack: 5 },
          { itemId: 'keys', perPack: 1 },
        ],
        31,
      ),
    ).toEqual([
      { itemId: 'peach', pieces: -155 },
      { itemId: 'keys', pieces: -31 },
    ])
  })
})

describe('repackedMessage', () => {
  it('counts the packs made', () => {
    expect(repackedMessage(31, 'Candy pack')).toBe('Repacked 31 Candy packs')
    expect(repackedMessage(1, 'Candy pack')).toBe('Repacked 1 Candy pack')
    expect(repackedMessage(4, 'Sour Keys')).toBe('Repacked 4 Sour Keys')
  })
})
