import { describe, expect, it } from 'vitest'
import { buildEmail, type Report } from './claims-email'

const report: Report = {
  since: '2026-09-21T16:00:00Z',
  deposits: [
    {
      sale_date: '2026-09-22',
      deposit_cents: 13700,
      revenue_cents: 9000,
      volunteers: 'Yuki, Priya',
    },
    {
      sale_date: '2026-09-24',
      deposit_cents: 14600,
      revenue_cents: 8500,
      volunteers: 'Calvin, Yuki',
    },
  ],
  deposited_cents: 28300,
  to_reimburse: [
    {
      buyer_id: 'b-yuki',
      buyer_name: 'Yuki',
      buyer_full_name: null,
      total_cents: 7707,
      claims: [
        {
          id: 'c3',
          label: 'SS-003',
          purchased_on: '2026-09-18',
          store: 'Costco',
          total_cents: 4272,
          refunded_cents: 0,
          receipt_path: 'c3/r.jpg',
        },
        {
          id: 'c4',
          label: 'SS-004',
          purchased_on: '2026-09-25',
          store: 'Superstore',
          total_cents: 2635,
          refunded_cents: 800,
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
      buyer_full_name: null,
      total_cents: 4272,
      refunded_cents: 0,
      status: 'to_pay',
      paid_at: null,
      payment_note: null,
    },
    {
      label: 'SS-001',
      purchased_on: '2026-09-08',
      store: 'Costco',
      buyer_name: 'Calvin',
      buyer_full_name: null,
      total_cents: 5000,
      refunded_cents: 0,
      status: 'paid',
      paid_at: '2026-09-12T18:00:00Z',
      payment_note: 'Cheque #118',
    },
  ],
}

const attachments = { c3: 'SS-003.jpg', c4: 'SS-004.jpg' }

describe('buildEmail', () => {
  const email = buildEmail(report, attachments)

  it('flags the email for the treasurer', () => {
    expect(email.subject).toBe('ATTN: Treasurer: Snack Shack claims')
  })

  it('adds the full name the treasurer pays by', () => {
    const named = buildEmail(
      {
        ...report,
        to_reimburse: [
          {
            ...report.to_reimburse[0],
            buyer_name: 'Calvin C',
            buyer_full_name: 'Chun Yu Chan',
          },
        ],
        ledger: [
          {
            ...report.ledger[0],
            buyer_name: 'Calvin C',
            buyer_full_name: 'Chun Yu Chan',
          },
        ],
      },
      attachments,
    )
    expect(named.html).toContain('<h3>Calvin C (Chun Yu Chan): cheque for')
    expect(named.text).toContain('Calvin C (Chun Yu Chan): cheque for')
    expect(named.csv.split('\n')[1]).toContain(',Calvin C (Chun Yu Chan),')
  })

  it('shows the display name alone when there is no full name', () => {
    expect(email.html).toContain('<h3>Yuki: cheque for $77.07')
  })

  it('says which sale days the deposits cover', () => {
    expect(email.html).toContain('since the last email on Sep 21.')
    const first = buildEmail({ ...report, since: null }, attachments)
    expect(first.html).toContain('Every sale day closed so far.')
  })

  it('lists each deposit with who closed it and the revenue', () => {
    expect(email.html).toContain('Sep 22')
    expect(email.html).toContain('$137.00')
    expect(email.html).toContain('Yuki, Priya')
    expect(email.html).toContain('revenue $90.00')
    expect(email.html).toContain('revenue $85.00')
  })

  it('groups reimbursements per volunteer with each claim number, date and store', () => {
    expect(email.html).toContain('$77.07')
    expect(email.html).toContain('SS-003 (Sep 18, Costco, $42.72)')
    expect(email.text).toContain('SS-004 (Sep 25, Superstore, $26.35')
  })

  it('has no links and no Mark paid buttons', () => {
    expect(email.html).not.toContain('href=')
    expect(email.text).not.toContain('http')
    expect(email.html).not.toContain('mark')
  })

  it('stops a store name from running as a spreadsheet formula', () => {
    const csv = buildEmail(
      {
        ...report,
        ledger: [{ ...report.ledger[0], store: '=SUM(A1)' }],
      },
      attachments,
    ).csv
    expect(csv.split('\n')[1]).toContain(",'=SUM(A1),")
  })

  it('makes a CSV of the whole ledger, quoting commas and quotes', () => {
    expect(email.csv.split('\n')).toEqual([
      'Claim,Date,Store,Volunteer,Total,Refunded,Status,Paid on,Paid note',
      'SS-003,2026-09-18,"Costco, ""bulk""",Yuki,42.72,0.00,To pay,,',
      'SS-001,2026-09-08,Costco,Calvin,50.00,0.00,Paid,2026-09-12,Cheque #118',
    ])
  })

  it('notes a refund beside the net total, and says nothing when there is none', () => {
    expect(email.html).toContain('Superstore, $26.35, incl. $8.00 refund')
    expect(email.text).toContain('Superstore, $26.35, incl. $8.00 refund')
    expect(email.html).toContain('Costco, $42.72)')
  })

  it('says the receipt photos are attached only when they are', () => {
    expect(email.html).toContain(
      'Receipt photos are attached, named by claim number.',
    )
    expect(email.text).toContain(
      'Receipt photos are attached, named by claim number.',
    )
    const bare = buildEmail(report, {})
    expect(bare.text).not.toContain('Receipt photos')
  })

  it('calls a claim refunded to $0 Refunded in the CSV', () => {
    const csv = buildEmail(
      {
        ...report,
        ledger: [
          {
            ...report.ledger[0],
            total_cents: 0,
            refunded_cents: 4272,
            status: 'refunded',
          },
        ],
      },
      attachments,
    ).csv
    expect(csv.split('\n')[1]).toContain(',0.00,42.72,Refunded,')
  })

  it('escapes names so a store cannot inject markup', () => {
    const tricky = buildEmail(
      {
        ...report,
        to_reimburse: [
          { ...report.to_reimburse[0], buyer_name: '<b>Yuki</b>' },
        ],
      },
      attachments,
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
      {},
    )
    expect(quiet.subject).toBe('ATTN: Treasurer: Snack Shack claims')
    expect(quiet.html).toContain('No sale days closed.')
    expect(quiet.html).toContain('Nothing to reimburse.')
  })
})
