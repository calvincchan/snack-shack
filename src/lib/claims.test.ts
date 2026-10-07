import { describe, expect, it } from 'vitest'
import { claimsCsv, groupByBuyer, toClaims, type Claim } from '@/lib/claims'
import type { Tables } from '@/lib/database.types'

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
    lines: [],
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

describe('toClaims', () => {
  const row = {
    id: 'p1',
    claim_label: 'SS-001',
    purchased_on: '2026-09-08',
    store: 'Costco',
    buyer_id: 'yuki',
    buyer_name: 'Yuki',
    total_cents: 3000,
    status: 'to_pay',
    paid_at: null,
    payment_ref: null,
    receipt_path: 'r.jpg',
  } as Tables<'claims'>

  function line(id: string, purchaseId: string, lineNo: number) {
    return {
      id,
      purchase_id: purchaseId,
      line_no: lineNo,
      item_name: `Item ${id}`,
      pieces: 10,
      cost_cents: 1500,
    } as Tables<'claim_lines'>
  }

  it('gives each claim its own lines in receipt order', () => {
    const [first, second] = toClaims(
      [row, { ...row, id: 'p2' }],
      [line('b', 'p1', 2), line('x', 'p2', 1), line('a', 'p1', 1)],
    )

    expect(first.lines.map((l) => l.id)).toEqual(['a', 'b'])
    expect(second.lines.map((l) => l.id)).toEqual(['x'])
    expect(first.lines[0]).toEqual({
      id: 'a',
      item: 'Item a',
      pieces: 10,
      costCents: 1500,
    })
  })
})
