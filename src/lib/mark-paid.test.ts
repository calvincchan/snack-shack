import { describe, expect, it } from 'vitest'
import { paidSummary, parseRedeem } from '@/lib/mark-paid'

describe('paidSummary', () => {
  it('counts receipts', () => {
    expect(paidSummary('Yuki', 2)).toBe("Yuki's 2 receipts marked paid")
    expect(paidSummary('Yuki', 1)).toBe("Yuki's 1 receipt marked paid")
  })

  it('says so when someone already paid them in the app', () => {
    expect(paidSummary('Yuki', 0)).toBe('Nothing left to pay for Yuki')
  })
})

describe('parseRedeem', () => {
  it('reads a paid answer', () => {
    expect(
      parseRedeem({ status: 'paid', buyer_name: 'Yuki', purchases_paid: 2 }),
    ).toEqual({ status: 'paid', buyerName: 'Yuki', count: 2 })
  })

  it('keeps the database message for a used or expired link', () => {
    expect(
      parseRedeem({
        status: 'used',
        message: 'This link has already been used.',
      }),
    ).toEqual({ status: 'used', message: 'This link has already been used.' })
    expect(parseRedeem({ status: 'expired', message: 'Old.' }).status).toBe(
      'expired',
    )
  })

  it('turns anything else into a plain error', () => {
    expect(parseRedeem({ error: 'boom' }).status).toBe('error')
    expect(parseRedeem(null).status).toBe('error')
  })
})
