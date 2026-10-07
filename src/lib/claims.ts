import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCents } from '@/lib/money'
import type { Enums, Tables } from '@/lib/database.types'

type ClaimRow = Tables<'claims'>
type LineRow = Tables<'claim_lines'>

/** One line of a claim, as printed on the receipt. */
export type ReceiptLine = {
  id: string
  item: string
  pieces: number
  costCents: number
}

/** A row of the `claims` view, with the columns a view makes nullable narrowed. */
export type Claim = {
  id: string
  label: string
  purchasedOn: string
  store: string
  buyerId: string
  buyerName: string
  totalCents: number
  status: Enums<'claim_status'>
  paidAt: string | null
  paymentRef: string | null
  receiptPath: string
  lines: ReceiptLine[]
}

function toLine(row: LineRow): ReceiptLine {
  return {
    id: row.id!,
    item: row.item_name!,
    pieces: row.pieces!,
    costCents: row.cost_cents!,
  }
}

/** Pairs each claim with its lines, in receipt order. */
export function toClaims(rows: ClaimRow[], lineRows: LineRow[]): Claim[] {
  const lines = new Map<string, LineRow[]>()
  for (const line of [...lineRows].sort((a, b) => a.line_no! - b.line_no!)) {
    lines.set(line.purchase_id!, [
      ...(lines.get(line.purchase_id!) ?? []),
      line,
    ])
  }

  return rows.map((row) => toClaim(row, (lines.get(row.id!) ?? []).map(toLine)))
}

function toClaim(row: ClaimRow, lines: ReceiptLine[]): Claim {
  return {
    id: row.id!,
    label: row.claim_label!,
    purchasedOn: row.purchased_on!,
    store: row.store!,
    buyerId: row.buyer_id!,
    buyerName: row.buyer_name!,
    totalCents: row.total_cents!,
    status: row.status!,
    paidAt: row.paid_at,
    paymentRef: row.payment_ref,
    receiptPath: row.receipt_path!,
    lines,
  }
}

export function useClaims() {
  return useQuery({
    queryKey: ['claims'],
    queryFn: async (): Promise<Claim[]> => {
      const [claims, lines] = await Promise.all([
        supabase
          .from('claims')
          .select('*')
          .order('claim_no', { ascending: false }),
        supabase.from('claim_lines').select('*'),
      ])
      if (claims.error) throw claims.error
      if (lines.error) throw lines.error

      return toClaims(claims.data, lines.data)
    },
  })
}

/** Receipts live in a private bucket, so links are short-lived. */
export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(path, 60 * 10)
  if (error) throw error
  return data.signedUrl
}

export type BuyerGroup = {
  buyerId: string
  buyerName: string
  claims: Claim[]
  totalCents: number
}

export function groupByBuyer(claims: Claim[]): BuyerGroup[] {
  const groups = new Map<string, BuyerGroup>()

  for (const claim of claims) {
    const group = groups.get(claim.buyerId) ?? {
      buyerId: claim.buyerId,
      buyerName: claim.buyerName,
      claims: [],
      totalCents: 0,
    }
    group.claims.push(claim)
    group.totalCents += claim.totalCents
    groups.set(claim.buyerId, group)
  }

  return [...groups.values()].sort((a, b) => b.totalCents - a.totalCents)
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** The ledger the treasurer pastes into a spreadsheet. Dollars, not cents. */
export function claimsCsv(claims: Claim[]): string {
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

  const rows = claims.map((claim) => [
    claim.label,
    claim.purchasedOn,
    claim.store,
    claim.buyerName,
    formatCents(claim.totalCents).replace('$', ''),
    claim.status === 'paid' ? 'Paid' : 'To pay',
    claim.paidAt ? claim.paidAt.slice(0, 10) : '',
    claim.paymentRef ?? '',
  ])

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}
