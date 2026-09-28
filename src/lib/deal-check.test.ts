import { describe, expect, it } from 'vitest'
import { dealCheck, type DealInput } from '@/lib/deal-check'
import { priceLabel } from '@/lib/pricing'

/** The prototype's worked example: $17.99 for 130 mini bars. */
function input(overrides: Partial<DealInput> = {}): DealInput {
  return {
    shelfCents: 1799,
    pieces: 130,
    addGst: false,
    gstRate: 0.05,
    usualCostCents: 52,
    piecesPerDayOut: 15,
    ...overrides,
  }
}

describe('dealCheck', () => {
  it('works the box out the way HANDOFF §5.4 does', () => {
    const deal = dealCheck(input())!

    expect(deal.totalCents).toBe(1799)
    expect(deal.costPerPieceCents).toBeCloseTo(13.84, 2)
    expect(
      priceLabel(deal.suggested.priceCents, deal.suggested.bundleSize),
    ).toBe('2 for $1')
    expect(deal.band.label).toBe('Great deal')
    expect(deal.deals).toBe(65)
    expect(deal.salesCents).toBe(6500)
    expect(deal.profitCents).toBe(4701)
  })

  it('adds GST when the shelf label leaves it off', () => {
    const deal = dealCheck(input({ addGst: true }))!

    expect(deal.totalCents).toBe(1889) // 17.99 × 1.05, to the cent
    expect(deal.costPerPieceCents).toBeCloseTo(14.53, 2)
  })

  it('compares a piece with what this type usually costs', () => {
    expect(dealCheck(input())!.differenceFromUsualCents).toBeCloseTo(
      13.84 - 52,
      2,
    )
    expect(
      dealCheck(input({ usualCostCents: 10 }))!.differenceFromUsualCents,
    ).toBeCloseTo(3.84, 2)
    expect(
      dealCheck(input({ usualCostCents: null }))!.differenceFromUsualCents,
    ).toBeNull()
  })

  it('leaves out the sale days when nothing of this type has sold yet', () => {
    const deal = dealCheck(input({ piecesPerDayOut: null }))!

    expect(deal.saleDays).toBeNull()
    expect(deal.tooBig).toBe(false)
  })

  it('warns that a box is too big past six sale days', () => {
    // 65 deals at 15 a day is about 4.3 sale days: fine.
    expect(dealCheck(input())!.tooBig).toBe(false)

    // The same box where this type only moves 8 a day: 8.1 sale days.
    const slower = dealCheck(input({ piecesPerDayOut: 8 }))!
    expect(slower.saleDays).toBeCloseTo(8.125, 3)
    expect(slower.tooBig).toBe(true)
  })

  it('counts whole deals only, ignoring the pieces left over', () => {
    const deal = dealCheck(input({ shelfCents: 1799, pieces: 131 }))!

    expect(deal.deals).toBe(65)
  })

  it('can lose money on a box', () => {
    // 24 chocolate bars at $22.80 is 95¢ each, sold at $2.
    const deal = dealCheck(
      input({ shelfCents: 2280, pieces: 24, usualCostCents: 95 }),
    )!

    expect(
      priceLabel(deal.suggested.priceCents, deal.suggested.bundleSize),
    ).toBe('$2')
    expect(deal.salesCents).toBe(4800)
    expect(deal.profitCents).toBe(2520)

    // And a box where even the best price is under water.
    const bad = dealCheck(input({ shelfCents: 5000, pieces: 20 }))!
    expect(bad.band.label).toBe('At a loss')
    expect(bad.profitCents).toBeLessThan(0)
  })

  it('has nothing to say until both numbers are in', () => {
    expect(dealCheck(input({ pieces: 0 }))).toBeNull()
    expect(dealCheck(input({ shelfCents: 0 }))).toBeNull()
    expect(dealCheck(input({ pieces: Number.NaN }))).toBeNull()
  })
})
