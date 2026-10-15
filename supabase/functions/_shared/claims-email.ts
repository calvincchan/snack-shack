/**
 * Words the claims email the coordinator sends to the treasurer (ADR-0017,
 * HANDOFF §5.9). Pure: it takes the facts from `claims_report()` plus the names
 * of the attached receipt photos, and returns the subject, HTML, plain text and
 * CSV. No Deno or Node APIs here, so Vitest can run it.
 */

export type Report = {
  /** When the last email went out; null before the first send. */
  since: string | null
  deposits: {
    sale_date: string
    deposit_cents: number
    revenue_cents: number
    volunteers: string
  }[]
  deposited_cents: number
  to_reimburse: {
    buyer_id: string
    buyer_name: string
    buyer_full_name: string | null
    total_cents: number
    claims: {
      id: string
      label: string
      purchased_on: string
      store: string
      /** What is owed on the claim: the receipt total minus refunds. */
      total_cents: number
      refunded_cents: number
      receipt_path: string
    }[]
  }[]
  to_reimburse_cents: number
  ledger: {
    label: string
    purchased_on: string
    store: string
    buyer_name: string
    buyer_full_name: string | null
    /** Net of refunds. */
    total_cents: number
    refunded_cents: number
    /** `to_pay`, `paid`, or `refunded` for a To pay claim refunded to $0. */
    status: string
    paid_at: string | null
    payment_note: string | null
  }[]
}

/** Claim id to the attached receipt photo's file name, e.g. "SS-003.jpg". */
export type Attachments = Record<string, string>

export type Email = { subject: string; html: string; text: string; csv: string }

const dollars = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

const money = (cents: number) => dollars.format(cents / 100)

/**
 * "Calvin C (Chun Yu Chan)": the treasurer pays the name on the bank account.
 * The display name alone when no full name is set.
 */
function buyerLabel(buyer: {
  buyer_name: string
  buyer_full_name: string | null
}): string {
  return buyer.buyer_full_name
    ? `${buyer.buyer_name} (${buyer.buyer_full_name})`
    : buyer.buyer_name
}

/** "$32.00" or "$32.00, incl. $8.00 refund" */
function owed(claim: { total_cents: number; refunded_cents: number }): string {
  return claim.refunded_cents > 0
    ? `${money(claim.total_cents)}, incl. ${money(claim.refunded_cents)} refund`
    : money(claim.total_cents)
}

/** "2026-09-21" to "Sep 21", read piece by piece so no time zone shifts it. */
function shortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
  })
}

function revenue(cents: number): string {
  return `revenue ${money(cents)}`
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * A spreadsheet runs a cell that starts with = + - or @ as a formula, and the
 * store name is typed by a volunteer, so such cells get a leading apostrophe.
 */
function csvCell(value: string): string {
  if (/^[=+\-@]/.test(value)) value = `'${value}`
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function toCsv(ledger: Report['ledger']): string {
  const header = [
    'Claim',
    'Date',
    'Store',
    'Volunteer',
    'Total',
    'Refunded',
    'Status',
    'Paid on',
    'Paid note',
  ]
  const rows = ledger.map((claim) => [
    claim.label,
    claim.purchased_on,
    claim.store,
    buyerLabel(claim),
    (claim.total_cents / 100).toFixed(2),
    (claim.refunded_cents / 100).toFixed(2),
    claim.status === 'paid'
      ? 'Paid'
      : claim.status === 'refunded'
        ? 'Refunded'
        : 'To pay',
    claim.paid_at ? claim.paid_at.slice(0, 10) : '',
    claim.payment_note ?? '',
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

/** "Oct 13" in Vancouver, from a timestamp. */
function sentDate(when: string): string {
  return new Date(when).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Vancouver',
  })
}

export function buildEmail(report: Report, attachments: Attachments): Email {
  const subject = 'ATTN: Treasurer: Snack Shack claims'
  const sinceNote = report.since
    ? `Sale days closed since the last email on ${sentDate(report.since)}.`
    : 'Every sale day closed so far.'

  const depositHtml =
    report.deposits.length === 0
      ? '<p>No sale days closed.</p>'
      : `<table cellpadding="6" style="border-collapse:collapse">${report.deposits
          .map(
            (d) =>
              `<tr><td><b>${shortDate(d.sale_date)}</b></td><td>${escapeHtml(d.volunteers)}</td><td style="text-align:right">${money(d.deposit_cents)}</td><td>${revenue(d.revenue_cents)}</td></tr>`,
          )
          .join('')}</table>`

  const buyerHtml =
    report.to_reimburse.length === 0
      ? '<p>Nothing to reimburse.</p>'
      : report.to_reimburse
          .map((buyer) => {
            const claims = buyer.claims
              .map(
                (claim) =>
                  `${escapeHtml(claim.label)} (${shortDate(claim.purchased_on)}, ${escapeHtml(claim.store)}, ${owed(claim)})`,
              )
              .join(', ')
            return `<h3>${escapeHtml(buyerLabel(buyer))}: cheque for ${money(buyer.total_cents)}</h3><p>${buyer.claims.length} ${buyer.claims.length === 1 ? 'receipt' : 'receipts'}: ${claims}</p>`
          })
          .join('')

  const photos =
    Object.keys(attachments).length > 0
      ? 'Receipt photos are attached, named by claim number. '
      : ''

  const html = `<div style="font-family:sans-serif;max-width:560px"><h2>To reimburse: ${money(report.to_reimburse_cents)}</h2>${buyerHtml}<h2>Deposits: ${money(report.deposited_cents)}</h2><p>${sinceNote}</p>${depositHtml}<p style="color:#666;font-size:13px">${photos}The CSV ledger is attached.</p></div>`

  const depositText =
    report.deposits.length === 0
      ? 'No sale days closed.'
      : report.deposits
          .map(
            (d) =>
              `${shortDate(d.sale_date)}  ${money(d.deposit_cents)}  ${d.volunteers}  ${revenue(d.revenue_cents)}`,
          )
          .join('\n')

  const buyerText =
    report.to_reimburse.length === 0
      ? 'Nothing to reimburse.'
      : report.to_reimburse
          .map((buyer) => {
            const claims = buyer.claims
              .map(
                (c) =>
                  `  ${c.label} (${shortDate(c.purchased_on)}, ${c.store}, ${owed(c)})`,
              )
              .join('\n')
            return `${buyerLabel(buyer)}: cheque for ${money(buyer.total_cents)}\n${claims}`
          })
          .join('\n\n')

  const text = `To reimburse: ${money(report.to_reimburse_cents)}\n${buyerText}\n\nDeposits: ${money(report.deposited_cents)}\n${sinceNote}\n${depositText}\n\n${photos}The CSV ledger is attached.`

  return { subject, html, text, csv: toCsv(report.ledger) }
}
