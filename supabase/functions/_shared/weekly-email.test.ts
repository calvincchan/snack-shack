import { describe, expect, it } from 'vitest'
import { buildEmail, type Report } from './weekly-email'

const report: Report = {
  week_start: '2026-09-21',
  deposits: [
    {
      sale_date: '2026-09-22',
      deposit_cents: 13700,
      over_short_cents: 200,
      volunteers: 'Yuki, Priya',
    },
    {
      sale_date: '2026-09-24',
      deposit_cents: 14600,
      over_short_cents: -400,
      volunteers: 'Calvin, Yuki',
    },
  ],
  deposited_cents: 28300,
  to_reimburse: [
    {
      buyer_id: 'b-yuki',
      buyer_name: 'Yuki',
      total_cents: 7707,
      claims: [
        {
          id: 'c3',
          label: 'SS-003',
          purchased_on: '2026-09-18',
          store: 'Costco',
          total_cents: 4272,
          receipt_path: 'c3/r.jpg',
        },
        {
          id: 'c4',
          label: 'SS-004',
          purchased_on: '2026-09-25',
          store: 'Superstore',
          total_cents: 3435,
          receipt_path: 'c4/r.jpg',
        },
      ],
    },
  ],
  to_reimburse_cents: 7570,
  ledger: [
    {
      label: 'SS-003',
      purchased_on: '2026-09-18',
      store: 'Costco, "bulk"',
      buyer_name: 'Yuki',
      total_cents: 4272,
      status: 'to_pay',
      paid_at: null,
      payment_ref: null,
    },
    {
      label: 'SS-001',
      purchased_on: '2026-09-08',
      store: 'Costco',
      buyer_name: 'Calvin',
      total_cents: 5000,
      status: 'paid',
      paid_at: '2026-09-12T18:00:00Z',
      payment_ref: 'E-transfer',
    },
  ],
}

const links = {
  markPaid: { 'b-yuki': 'https://app.test/mark-paid?token=abc' },
  receipts: {
    c3: 'https://files.test/c3?sig=1',
    c4: 'https://files.test/c4?sig=2',
  },
}

describe('buildEmail', () => {
  const email = buildEmail(report, links)

  it('puts the week and both totals in the subject', () => {
    expect(email.subject).toBe(
      'Snack Shack week of Sep 21: $283.00 deposited, $75.70 to reimburse',
    )
  })

  it('lists each deposit with volunteers and the over/short', () => {
    expect(email.html).toContain('Sep 22')
    expect(email.html).toContain('$137.00')
    expect(email.html).toContain('Yuki, Priya')
    expect(email.html).toContain('Over $2.00')
    expect(email.html).toContain('Short $4.00')
  })

  it('groups reimbursements per volunteer with linked claim numbers', () => {
    expect(email.html).toContain('Yuki')
    expect(email.html).toContain('$77.07')
    expect(email.html).toContain(
      '<a href="https://files.test/c3?sig=1">SS-003</a>',
    )
    expect(email.html).toContain(
      '<a href="https://files.test/c4?sig=2">SS-004</a>',
    )
  })

  it('gives each volunteer a Mark paid button', () => {
    expect(email.html).toContain('href="https://app.test/mark-paid?token=abc"')
    expect(email.html).toContain('Mark Yuki paid')
  })

  it('stops a store name from running as a spreadsheet formula', () => {
    const csv = buildEmail(
      {
        ...report,
        ledger: [{ ...report.ledger[0], store: '=SUM(A1)' }],
      },
      links,
    ).csv
    expect(csv.split('\n')[1]).toContain(",'=SUM(A1),")
  })

  it('repeats the links in the plain text version', () => {
    expect(email.text).toContain(
      'Mark Yuki paid: https://app.test/mark-paid?token=abc',
    )
    expect(email.text).toContain('SS-003 https://files.test/c3?sig=1')
  })

  it('makes a CSV of the whole ledger, quoting commas and quotes', () => {
    expect(email.csv.split('\n')).toEqual([
      'Claim,Date,Store,Volunteer,Total,Status,Paid on,Reference',
      'SS-003,2026-09-18,"Costco, ""bulk""",Yuki,42.72,To pay,,',
      'SS-001,2026-09-08,Costco,Calvin,50.00,Paid,2026-09-12,E-transfer',
    ])
  })

  it('escapes names so a store cannot inject markup', () => {
    const tricky = buildEmail(
      {
        ...report,
        to_reimburse: [
          { ...report.to_reimburse[0], buyer_name: '<b>Yuki</b>' },
        ],
      },
      links,
    )
    expect(tricky.html).not.toContain('<b>Yuki</b>')
    expect(tricky.html).toContain('&lt;b&gt;Yuki&lt;/b&gt;')
  })

  it('says so when nothing happened', () => {
    const quiet = buildEmail(
      {
        ...report,
        deposits: [],
        deposited_cents: 0,
        to_reimburse: [],
        to_reimburse_cents: 0,
      },
      { markPaid: {}, receipts: {} },
    )
    expect(quiet.subject).toBe(
      'Snack Shack week of Sep 21: $0.00 deposited, $0.00 to reimburse',
    )
    expect(quiet.html).toContain('No sale days that week.')
    expect(quiet.html).toContain('Nothing to reimburse.')
  })
})
