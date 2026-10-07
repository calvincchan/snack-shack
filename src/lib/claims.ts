import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { itemsQueryKey } from '@/lib/items'
import { formatCents } from '@/lib/money'
import type { Enums, Tables } from '@/lib/database.types'

type ClaimRow = Tables<'claims'>
type LineRow = Tables<'claim_lines'>
type RefundRow = Tables<'claim_refunds'>

/** One line of a claim, as printed on the receipt. */
export type ReceiptLine = {
  id: string
  item: string
  pieces: number
  costCents: number
  /** What a refund can still take back from this line. */
  piecesLeft: number
  centsLeft: number
}

/** Pieces from a line that went back to the store, logged from the refund slip. */
export type Refund = {
  id: string
  lineId: string
  pieces: number
  amountCents: number
  refundedOn: string
  slipPath: string | null
  note: string | null
  by: string | null
}

/** A row of the `claims` view, with the columns a view makes nullable narrowed. */
export type Claim = {
  id: string
  label: string
  purchasedOn: string
  store: string
  buyerId: string
  buyerName: string
  /** The receipt total. `netCents` is what is owed. */
  totalCents: number
  refundedCents: number
  netCents: number
  status: Enums<'claim_status'>
  paidAt: string | null
  paymentRef: string | null
  receiptPath: string
  lines: ReceiptLine[]
  refunds: Refund[]
}

/** A To pay claim refunded down to $0 is done: it shows under Paid as Refunded. */
export function isRefunded(claim: Claim): boolean {
  return claim.status === 'to_pay' && claim.netCents === 0
}

/** The claim still waiting for the volunteer's money. */
export function isToPay(claim: Claim): boolean {
  return claim.status === 'to_pay' && claim.netCents > 0
}

function toLine(row: LineRow): ReceiptLine {
  return {
    id: row.id!,
    item: row.item_name!,
    pieces: row.pieces!,
    costCents: row.cost_cents!,
    piecesLeft: row.pieces_left!,
    centsLeft: row.cents_left!,
  }
}

function toRefund(row: RefundRow): Refund {
  return {
    id: row.id!,
    lineId: row.purchase_line_id!,
    pieces: row.pieces!,
    amountCents: row.amount_cents!,
    refundedOn: row.refunded_on!,
    slipPath: row.slip_path,
    note: row.note,
    by: row.created_by_name,
  }
}

/** Pairs each claim with its lines, in receipt order, and its refunds, oldest first. */
export function toClaims(
  rows: ClaimRow[],
  lineRows: LineRow[],
  refundRows: RefundRow[] = [],
): Claim[] {
  const lines = new Map<string, LineRow[]>()
  for (const line of [...lineRows].sort((a, b) => a.line_no! - b.line_no!)) {
    lines.set(line.purchase_id!, [
      ...(lines.get(line.purchase_id!) ?? []),
      line,
    ])
  }

  const refunds = new Map<string, Refund[]>()
  for (const row of [...refundRows].sort((a, b) =>
    a.created_at!.localeCompare(b.created_at!),
  )) {
    refunds.set(row.purchase_id!, [
      ...(refunds.get(row.purchase_id!) ?? []),
      toRefund(row),
    ])
  }

  return rows.map((row) =>
    toClaim(
      row,
      (lines.get(row.id!) ?? []).map(toLine),
      refunds.get(row.id!) ?? [],
    ),
  )
}

function toClaim(
  row: ClaimRow,
  lines: ReceiptLine[],
  refunds: Refund[],
): Claim {
  return {
    id: row.id!,
    label: row.claim_label!,
    purchasedOn: row.purchased_on!,
    store: row.store!,
    buyerId: row.buyer_id!,
    buyerName: row.buyer_name!,
    totalCents: row.total_cents!,
    refundedCents: row.refunded_cents!,
    netCents: row.net_cents!,
    status: row.status!,
    paidAt: row.paid_at,
    paymentRef: row.payment_ref,
    receiptPath: row.receipt_path!,
    lines,
    refunds,
  }
}

export function useClaims() {
  return useQuery({
    queryKey: ['claims'],
    queryFn: async (): Promise<Claim[]> => {
      const [claims, lines, refunds] = await Promise.all([
        supabase
          .from('claims')
          .select('*')
          .order('claim_no', { ascending: false }),
        supabase.from('claim_lines').select('*'),
        supabase.from('claim_refunds').select('*'),
      ])
      if (claims.error) throw claims.error
      if (lines.error) throw lines.error
      if (refunds.error) throw refunds.error

      return toClaims(claims.data, lines.data, refunds.data)
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
    group.totalCents += claim.netCents
    groups.set(claim.buyerId, group)
  }

  return [...groups.values()].sort((a, b) => b.totalCents - a.totalCents)
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** The ledger the treasurer pastes into a spreadsheet. Dollars, not cents; Total is net of refunds. */
export function claimsCsv(claims: Claim[]): string {
  const header = [
    'Claim',
    'Date',
    'Store',
    'Volunteer',
    'Total',
    'Refunded',
    'Status',
    'Paid on',
    'Reference',
  ]

  const rows = claims.map((claim) => [
    claim.label,
    claim.purchasedOn,
    claim.store,
    claim.buyerName,
    formatCents(claim.netCents).replace('$', ''),
    formatCents(claim.refundedCents).replace('$', ''),
    claim.status === 'paid'
      ? 'Paid'
      : isRefunded(claim)
        ? 'Refunded'
        : 'To pay',
    claim.paidAt ? claim.paidAt.slice(0, 10) : '',
    claim.paymentRef ?? '',
  ])

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

/**
 * Prefill for the refund amount: the share of what is left on the line that the
 * returned pieces make up. All the pieces left give all the cost left, so the
 * last refund on a line clears it to exactly $0.00. The slip has the last word.
 */
export function suggestRefundCents(
  line: Pick<ReceiptLine, 'piecesLeft' | 'centsLeft'>,
  pieces: number,
): number {
  if (line.piecesLeft <= 0 || pieces < 1) return 0
  const returned = Math.min(pieces, line.piecesLeft)
  return Math.round((line.centsLeft * returned) / line.piecesLeft)
}

export type NewRefund = {
  /** Generated when the dialog opens, so a retry cannot log it twice. */
  id: string
  lineId: string
  pieces: number
  amountCents: number
  refundedOn: string
  note: string
  slip: File | null
}

/** Refunds change stock and totals, so everything that shows them reloads. */
function useRefreshAfterRefund() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['claims'] }),
      queryClient.invalidateQueries({ queryKey: itemsQueryKey }),
    ])
}

/**
 * Upload the slip photo, if any, then `refund_purchase_line()` checks every
 * rule, logs the refund and takes the pieces out of stock. Both halves are
 * safe to retry with the same refund id.
 */
export function useAddRefund() {
  const refresh = useRefreshAfterRefund()
  return useMutation({
    mutationFn: async (refund: NewRefund) => {
      let slipPath: string | null = null
      if (refund.slip) {
        const extension = refund.slip.name.split('.').pop() ?? 'jpg'
        slipPath = `refunds/${refund.id}/slip.${extension}`
        // The bucket lets members add files but not replace them, so a retry
        // finds the slip already there. That is fine.
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(slipPath, refund.slip)
        if (
          uploadError &&
          !/already exists|duplicate/i.test(uploadError.message)
        )
          throw uploadError
      }

      const { error } = await supabase.rpc('refund_purchase_line', {
        p_id: refund.id,
        p_line: refund.lineId,
        p_pieces: refund.pieces,
        p_amount_cents: refund.amountCents,
        p_refunded_on: refund.refundedOn,
        p_slip_path: slipPath ?? undefined,
        p_note: refund.note.trim() || undefined,
      })
      if (error) throw error
    },
    onSuccess: refresh,
  })
}

export function useUndoRefund() {
  const refresh = useRefreshAfterRefund()
  return useMutation({
    mutationFn: async (refundId: string) => {
      const { error } = await supabase.rpc('undo_refund', { p_id: refundId })
      if (error) throw error
    },
    onSuccess: refresh,
  })
}
