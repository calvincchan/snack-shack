import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { itemsQueryKey } from '@/lib/items'
import type { Enums } from '@/lib/database.types'

export const STORES = [
  'Costco',
  'Wholesale Club',
  'Superstore',
  'Walmart',
  'Other',
] as const

/** The volunteers who can be reimbursed. */
export function useVolunteers() {
  return useQuery({
    queryKey: ['volunteers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('active', true)
        .neq('role', 'treasurer')
        .order('display_name')
      if (error) throw error
      return data
    },
  })
}

export type NewItem = {
  name: string
  type: Enums<'item_type'>
  storage: Enums<'storage_kind'>
}

export type PurchaseLine = {
  /** An existing item, or null when `newItem` describes one to create. */
  itemId: string | null
  newItem: NewItem | null
  pieces: number
  costCents: number
  /** null keeps an existing item's price, or leaves a new one needing one. */
  priceCents: number | null
  bundleSize: number
}

export type Purchase = {
  /** Generated on this phone, so a retry after a dropped connection is safe. */
  id: string
  purchasedOn: string
  store: string
  buyerId: string
  receipt: File
  lines: PurchaseLine[]
}

/**
 * Log one receipt: upload the photo, then hand the whole thing to
 * `log_purchase()`, which creates the claim, any new items, the lines, the
 * stock movements and the weighted-average costs in one transaction.
 *
 * Both halves are safe to retry with the same purchase id.
 */
export function useLogPurchase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (purchase: Purchase) => {
      const extension = purchase.receipt.name.split('.').pop() ?? 'jpg'
      const receiptPath = `${purchase.id}/receipt.${extension}`

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(receiptPath, purchase.receipt, { upsert: true })
      if (uploadError) throw uploadError

      const { data, error } = await supabase.rpc('log_purchase', {
        p: {
          id: purchase.id,
          purchased_on: purchase.purchasedOn,
          store: purchase.store,
          buyer_id: purchase.buyerId,
          receipt_path: receiptPath,
          lines: purchase.lines.map((line) => ({
            item_id: line.itemId,
            new_item: line.newItem
              ? {
                  name: line.newItem.name,
                  type: line.newItem.type,
                  storage: line.newItem.storage,
                }
              : null,
            pieces: line.pieces,
            cost_cents: line.costCents,
            price_cents: line.priceCents,
            bundle_size: line.bundleSize,
          })),
        },
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: itemsQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['claims'] })
    },
  })
}

export function useClaim(id: string | null) {
  return useQuery({
    queryKey: ['claims', id],
    enabled: id !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('claims')
        .select('claim_label, total_cents, buyer_name')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}
