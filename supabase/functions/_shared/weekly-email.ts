/**
 * Words the weekly treasurer email (HANDOFF §5.9). Pure: it takes the facts
 * from `weekly_treasurer_report()` plus the links the function issued, and
 * returns the subject, HTML, plain text and CSV. No Deno or Node APIs here, so
 * Vitest can run it.
 */

export type Report = {
  week_start: string
  deposits: {
    sale_date: string
    deposit_cents: number
    over_short_cents: number
    volunteers: string
  }[]
  deposited_cents: number
  to_reimburse: {
    buyer_id: string
    buyer_name: string
    total_cents: number
    claims: {
      id: string
      label: string
      purchased_on: string
      store: string
      total_cents: number
      receipt_path: string
    }[]
  }[]
  to_reimburse_cents: number
  ledger: {
    label: string
    purchased_on: string
    store: string
    buyer_name: string
    total_cents: number
    status: string
    paid_at: string | null
    payment_ref: string | null
  }[]
}

export type Links = {
  /** Buyer id to the one-time Mark paid link. */
  markPaid: Record<string, string>
  /** Claim id to a signed receipt photo URL. */
  receipts: Record<string, string>
}

export type Email = { subject: string; html: string; text: string; csv: string }

const dollars = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

const money = (cents: number) => dollars.format(cents / 100)

/** "2026-09-21" to "Sep 21", read piece by piece so no time zone shifts it. */
function shortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
  })
}

function overShort(cents: number): string {
  if (cents === 0) return 'Balanced'
  return `${cents > 0 ? 'Over' : 'Short'} ${money(Math.abs(cents))}`
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
    'Status',
    'Paid on',
    'Reference',
  ]
  const rows = ledger.map((claim) => [
    claim.label,
    claim.purchased_on,
    claim.store,
    claim.buyer_name,
    (claim.total_cents / 100).toFixed(2),
    claim.status === 'paid' ? 'Paid' : 'To pay',
    claim.paid_at ? claim.paid_at.slice(0, 10) : '',
    claim.payment_ref ?? '',
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

export function buildEmail(report: Report, links: Links): Email {
  const week = shortDate(report.week_start)
  const subject = `Snack Shack week of ${week}: ${money(report.deposited_cents)} deposited, ${money(report.to_reimburse_cents)} to reimburse`

  const depositHtml =
    report.deposits.length === 0
      ? '<p>No sale days that week.</p>'
      : `<table cellpadding="6" style="border-collapse:collapse">${report.deposits
          .map(
            (d) =>
              `<tr><td><b>${shortDate(d.sale_date)}</b></td><td>${escapeHtml(d.volunteers)}</td><td style="text-align:right">${money(d.deposit_cents)}</td><td>${overShort(d.over_short_cents)}</td></tr>`,
          )
          .join('')}</table>`

  const buyerHtml =
    report.to_reimburse.length === 0
      ? '<p>Nothing to reimburse.</p>'
      : report.to_reimburse
          .map((buyer) => {
            const claims = buyer.claims
              .map((claim) => {
                const url = links.receipts[claim.id]
                const label = url
                  ? `<a href="${escapeHtml(url)}">${escapeHtml(claim.label)}</a>`
                  : escapeHtml(claim.label)
                return `${label} (${escapeHtml(claim.store)}, ${money(claim.total_cents)})`
              })
              .join(', ')
            const link = links.markPaid[buyer.buyer_id]
            const button = link
              ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#F2A900;color:#1f1f1f;text-decoration:none;border-radius:8px;font-weight:bold">Mark ${escapeHtml(buyer.buyer_name)} paid</a></p>`
              : ''
            return `<h3>${escapeHtml(buyer.buyer_name)}: ${money(buyer.total_cents)}</h3><p>${buyer.claims.length} ${buyer.claims.length === 1 ? 'receipt' : 'receipts'}: ${claims}</p>${button}`
          })
          .join('')

  const html = `<div style="font-family:sans-serif;max-width:560px"><h2>Snack Shack, week of ${week}</h2><h3>Deposits: ${money(report.deposited_cents)}</h3>${depositHtml}<h2>To reimburse: ${money(report.to_reimburse_cents)}</h2>${buyerHtml}<p style="color:#666;font-size:13px">The CSV ledger is attached. Each button works once and expires in 7 days.</p></div>`

  const depositText =
    report.deposits.length === 0
      ? 'No sale days that week.'
      : report.deposits
          .map(
            (d) =>
              `${shortDate(d.sale_date)}  ${money(d.deposit_cents)}  ${d.volunteers}  ${overShort(d.over_short_cents)}`,
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
                  `  ${c.label}${links.receipts[c.id] ? ` ${links.receipts[c.id]}` : ''} (${c.store}, ${money(c.total_cents)})`,
              )
              .join('\n')
            const link = links.markPaid[buyer.buyer_id]
            return `${buyer.buyer_name}: ${money(buyer.total_cents)}\n${claims}${link ? `\n  Mark ${buyer.buyer_name} paid: ${link}` : ''}`
          })
          .join('\n\n')

  const text = `Snack Shack, week of ${week}\n\nDeposits: ${money(report.deposited_cents)}\n${depositText}\n\nTo reimburse: ${money(report.to_reimburse_cents)}\n${buyerText}\n\nThe CSV ledger is attached. Each link works once and expires in 7 days.`

  return { subject, html, text, csv: toCsv(report.ledger) }
}
