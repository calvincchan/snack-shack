import { supabase } from '@/lib/supabase'

export type MarkPaidResult =
  | { status: 'paid'; buyerName: string; count: number }
  | { status: 'invalid' | 'used' | 'expired' | 'changed'; message: string }
  | { status: 'error'; message: string }

const TRY_AGAIN = 'Something went wrong. Try the link again.'

/** "Yuki's 2 receipts marked paid" */
export function paidSummary(buyerName: string, count: number): string {
  if (count === 0) return `Nothing left to pay for ${buyerName}`
  return `${buyerName}'s ${count} ${count === 1 ? 'receipt' : 'receipts'} marked paid`
}

/** Read what the redeem function answered; anything odd becomes a plain error. */
export function parseRedeem(body: unknown): MarkPaidResult {
  const b = (body ?? {}) as Record<string, unknown>
  if (
    b.status === 'paid' &&
    typeof b.buyer_name === 'string' &&
    typeof b.purchases_paid === 'number'
  ) {
    return {
      status: 'paid',
      buyerName: b.buyer_name,
      count: b.purchases_paid,
    }
  }
  if (
    (b.status === 'invalid' ||
      b.status === 'used' ||
      b.status === 'expired' ||
      b.status === 'changed') &&
    typeof b.message === 'string'
  ) {
    return { status: b.status, message: b.message }
  }
  return { status: 'error', message: TRY_AGAIN }
}

export async function redeemMarkPaid(token: string): Promise<MarkPaidResult> {
  const { data, error } = await supabase.functions.invoke('redeem-mark-paid', {
    body: { token },
  })
  if (error) return { status: 'error', message: TRY_AGAIN }
  return parseRedeem(data)
}
