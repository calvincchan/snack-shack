import { describe, expect, it } from 'vitest'
import {
  formatMargin,
  lossPerDealCents,
  marginBand,
  marginOf,
  priceLabel,
  priceOptions,
} from '@/lib/pricing'

describe('priceLabel', () => {
  it('names each price option the way the table does', () => {
    expect(priceLabel(100, 1)).toBe('$1')
    expect(priceLabel(200, 1)).toBe('$2')
    expect(priceLabel(100, 2)).toBe('2 for $1')
    expect(priceLabel(100, 3)).toBe('3 for $1')
  })

  it('says so when the item still needs a price', () => {
    expect(priceLabel(null)).toBe('Needs a price')
  })
})

describe('marginOf', () => {
  it('counts the pieces in a deal', () => {
    // Mini bars: $17.99 for 130 = 13.84¢ each, sold 2 for $1 (HANDOFF §5.3).
    expect(marginOf(13.84, 100, 2)).toBeCloseTo(0.7232, 4)
    expect(formatMargin(marginOf(13.84, 100, 2))).toBe('72%')
  })

  it('goes negative when a deal costs more than it sells for', () => {
    expect(marginOf(54, 100, 2)).toBeCloseTo(-0.08, 4)
    expect(lossPerDealCents(54, 100, 2)).toBeCloseTo(8, 4)
    expect(lossPerDealCents(13.84, 100, 2)).toBe(0)
  })
})

describe('marginBand', () => {
  it('labels each band at its edge (HANDOFF §5.3)', () => {
    expect(marginBand(0.6).label).toBe('Great deal')
    expect(marginBand(0.59).label).toBe('Good')
    expect(marginBand(0.45).label).toBe('Good')
    expect(marginBand(0.44).label).toBe('Fair')
    expect(marginBand(0.3).label).toBe('Fair')
    expect(marginBand(0.29).label).toBe('Low margin')
    expect(marginBand(0).label).toBe('Low margin')
    expect(marginBand(-0.01).label).toBe('At a loss')
  })

  it('colours a loss red and a thin margin amber', () => {
    expect(marginBand(0.7).tone).toBe('ok')
    expect(marginBand(0.35).tone).toBe('warn')
    expect(marginBand(-0.1).tone).toBe('bad')
  })
})

describe('priceOptions', () => {
  it('suggests 2 for $1 on mini bars at 13.84¢, Great deal, 72%', () => {
    const suggested = priceOptions(13.84).find((option) => option.suggested)!

    expect(priceLabel(suggested.priceCents, suggested.bundleSize)).toBe(
      '2 for $1',
    )
    expect(suggested.band.label).toBe('Great deal')
    expect(formatMargin(suggested.margin)).toBe('72%')
  })

  it('matches the rice crackers card in the prototype', () => {
    const options = priceOptions(1499 / 50) // 29.98¢ a piece

    expect(
      options.map((o) => [
        priceLabel(o.priceCents, o.bundleSize),
        o.band.label,
        formatMargin(o.margin),
        o.suggested,
      ]),
    ).toEqual([
      ['$1', 'Great deal', '70%', true],
      ['$2', 'Great deal', '85%', false],
      ['2 for $1', 'Fair', '40%', false],
      ['3 for $1', 'Low margin', '10%', false],
    ])
  })

  it('falls back to $2 single when no $1 option is in range', () => {
    // 60¢ a piece: $1 single is only 40%, and both deals lose money, so rule 1
    // finds nothing and rule 2 takes the $2 single at 70%.
    const suggested = priceOptions(60).find((o) => o.suggested)!

    expect(priceLabel(suggested.priceCents, suggested.bundleSize)).toBe('$2')
    expect(formatMargin(suggested.margin)).toBe('70%')
  })

  it('falls back to the best margin when nothing is in range', () => {
    const suggested = priceOptions(5).find((o) => o.suggested)!

    // Everything is far above 75%, so take the highest: $2 single at 97.5%.
    expect(priceLabel(suggested.priceCents, suggested.bundleSize)).toBe('$2')
    expect(formatMargin(suggested.margin)).toBe('98%')
  })

  it('always marks exactly one option', () => {
    for (const cost of [1, 13.84, 29.98, 45, 60, 99, 150, 300]) {
      expect(priceOptions(cost).filter((o) => o.suggested)).toHaveLength(1)
    }
  })
})
