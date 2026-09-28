import { describe, expect, it } from 'vitest'
import { claimsCsv, groupByBuyer, type Claim } from '@/lib/claims'

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    label: 'SS-001',
    purchasedOn: '2026-09-08',
    store: 'Costco',
    buyerId: 'yuki',
    buyerName: 'Yuki',
    totalCents: 4858,
    status: 'to_pay',
    paidAt: null,
    paymentRef: null,
    receiptPath: 'seed/costco-0908.jpg',
    ...overrides,
  }
}

describe('groupByBuyer', () => {
  it('adds up each volunteer and puts the biggest debt first', () => {
    const groups = groupByBuyer([
      claim({ id: '1', buyerId: 'yuki', buyerName: 'Yuki', totalCents: 1000 }),
      claim({
        id: '2',
        buyerId: 'calvin',
        buyerName: 'Calvin',
        totalCents: 4000,
      }),
      claim({ id: '3', buyerId: 'yuki', buyerName: 'Yuki', totalCents: 500 }),
    ])

    expect(
      groups.map((group) => [
        group.buyerName,
        group.totalCents,
        group.claims.length,
      ]),
    ).toEqual([
      ['Calvin', 4000, 1],
      ['Yuki', 1500, 2],
    ])
  })

  it('has nothing to show when nothing is owed', () => {
    expect(groupByBuyer([])).toEqual([])
  })
})

describe('claimsCsv', () => {
  it('writes dollars, not cents', () => {
    const csv = claimsCsv([claim({ totalCents: 4858 })])

    expect(csv.split('\n')[0]).toBe(
      'Claim,Date,Store,Volunteer,Total,Status,Paid on,Reference',
    )
    expect(csv.split('\n')[1]).toBe(
      'SS-001,2026-09-08,Costco,Yuki,48.58,To pay,,',
    )
  })

  it('carries the payment reference on a paid claim', () => {
    const csv = claimsCsv([
      claim({
        status: 'paid',
        paidAt: '2026-09-12T18:00:00Z',
        paymentRef: 'E-transfer',
      }),
    ])

    expect(csv.split('\n')[1]).toBe(
      'SS-001,2026-09-08,Costco,Yuki,48.58,Paid,2026-09-12,E-transfer',
    )
  })

  it('quotes anything with a comma in it', () => {
    const csv = claimsCsv([claim({ store: 'Superstore, Langley' })])

    expect(csv).toContain('"Superstore, Langley"')
  })
})
