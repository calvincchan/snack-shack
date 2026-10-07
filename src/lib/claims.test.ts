import { describe, expect, it } from 'vitest'
import {
  claimsCsv,
  groupByBuyer,
  isRefunded,
  isToPay,
  suggestRefundCents,
  toClaims,
  type Claim,
} from '@/lib/claims'
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
    refundedCents: 0,
    netCents: 4858,
    status: 'to_pay',
    paidAt: null,
    paymentRef: null,
    receiptPath: 'seed/costco-0908.jpg',
    lines: [],
    refunds: [],
    ...overrides,
  }
}

describe('groupByBuyer', () => {
  it('adds up each volunteer and puts the biggest debt first', () => {
    const groups = groupByBuyer([
      claim({ id: '1', buyerId: 'yuki', buyerName: 'Yuki', netCents: 1000 }),
      claim({
        id: '2',
        buyerId: 'calvin',
        buyerName: 'Calvin',
        netCents: 4000,
      }),
      claim({ id: '3', buyerId: 'yuki', buyerName: 'Yuki', netCents: 500 }),
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
    const csv = claimsCsv([claim()])

    expect(csv.split('\n')[0]).toBe(
      'Claim,Date,Store,Volunteer,Total,Refunded,Status,Paid on,Reference',
    )
    expect(csv.split('\n')[1]).toBe(
      'SS-001,2026-09-08,Costco,Yuki,48.58,0.00,To pay,,',
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
      'SS-001,2026-09-08,Costco,Yuki,48.58,0.00,Paid,2026-09-12,E-transfer',
    )
  })

  it('writes the net total and the refunded amount', () => {
    const csv = claimsCsv([claim({ netCents: 3200, refundedCents: 800 })])

    expect(csv.split('\n')[1]).toBe(
      'SS-001,2026-09-08,Costco,Yuki,32.00,8.00,To pay,,',
    )
  })

  it('calls a claim refunded to $0 Refunded', () => {
    const csv = claimsCsv([claim({ netCents: 0, refundedCents: 4858 })])

    expect(csv.split('\n')[1]).toBe(
      'SS-001,2026-09-08,Costco,Yuki,0.00,48.58,Refunded,,',
    )
  })

  it('quotes anything with a comma in it', () => {
    const csv = claimsCsv([claim({ store: 'Superstore, Langley' })])

    expect(csv).toContain('"Superstore, Langley"')
  })
})

describe('isRefunded and isToPay', () => {
  it('moves a To pay claim at net $0 out of To pay', () => {
    const zero = claim({ netCents: 0, refundedCents: 4858 })

    expect(isRefunded(zero)).toBe(true)
    expect(isToPay(zero)).toBe(false)
  })

  it('keeps a part-refunded claim in To pay', () => {
    const part = claim({ netCents: 3200, refundedCents: 800 })

    expect(isRefunded(part)).toBe(false)
    expect(isToPay(part)).toBe(true)
  })

  it('leaves a paid claim alone', () => {
    const paid = claim({ status: 'paid' })

    expect(isRefunded(paid)).toBe(false)
    expect(isToPay(paid)).toBe(false)
  })
})

describe('suggestRefundCents', () => {
  const line = { piecesLeft: 40, centsLeft: 3200 }

  it('is the share of what is left that the pieces make up', () => {
    expect(suggestRefundCents(line, 10)).toBe(800)
  })

  it('clears the line to exactly $0.00 when every piece goes back', () => {
    expect(suggestRefundCents({ piecesLeft: 3, centsLeft: 1000 }, 3)).toBe(1000)
  })

  it('rounds to the nearest cent', () => {
    expect(suggestRefundCents({ piecesLeft: 3, centsLeft: 1000 }, 1)).toBe(333)
    expect(suggestRefundCents({ piecesLeft: 3, centsLeft: 1000 }, 2)).toBe(667)
  })

  it('stops at what is left', () => {
    expect(suggestRefundCents(line, 99)).toBe(3200)
  })

  it('suggests nothing without pieces or with nothing left', () => {
    expect(suggestRefundCents(line, 0)).toBe(0)
    expect(suggestRefundCents({ piecesLeft: 0, centsLeft: 0 }, 5)).toBe(0)
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
    refunded_cents: 800,
    net_cents: 2200,
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
      pieces_left: 7,
      cents_left: 1050,
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
      piecesLeft: 7,
      centsLeft: 1050,
    })
    expect(first.netCents).toBe(2200)
    expect(first.refundedCents).toBe(800)
  })

  it('gives each claim its refunds, oldest first', () => {
    function refund(id: string, purchaseId: string, createdAt: string) {
      return {
        id,
        purchase_id: purchaseId,
        purchase_line_id: 'a',
        pieces: 3,
        amount_cents: 450,
        refunded_on: '2026-10-06',
        slip_path: null,
        note: 'Crushed',
        created_at: createdAt,
        created_by_name: 'Yuki',
      } as Tables<'claim_refunds'>
    }

    const [first, second] = toClaims(
      [row, { ...row, id: 'p2' }],
      [],
      [
        refund('late', 'p1', '2026-10-06T18:00:00Z'),
        refund('other', 'p2', '2026-10-06T12:00:00Z'),
        refund('early', 'p1', '2026-10-06T10:00:00Z'),
      ],
    )

    expect(first.refunds.map((r) => r.id)).toEqual(['early', 'late'])
    expect(second.refunds.map((r) => r.id)).toEqual(['other'])
    expect(first.refunds[0]).toEqual({
      id: 'early',
      lineId: 'a',
      pieces: 3,
      amountCents: 450,
      refundedOn: '2026-10-06',
      slipPath: null,
      note: 'Crushed',
      by: 'Yuki',
    })
  })
})
