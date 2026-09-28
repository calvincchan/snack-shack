import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Enums, Tables } from '@/lib/database.types'

type OverviewRow = Tables<'item_overview'>

/** A row of `item_overview`, with the columns a view makes nullable narrowed. */
export type Item = {
  id: string
  name: string
  type: Enums<'item_type'>
  storage: Enums<'storage_kind'>
  priceCents: number | null
  bundleSize: number
  /** Weighted-average cost of one piece, in cents, possibly fractional. */
  costPerPieceCents: number
  onHand: number
  isNew: boolean
  version: number
  lastBoughtBy: string | null
}

function toItem(row: OverviewRow): Item {
  return {
    id: row.id!,
    name: row.name!,
    type: row.type!,
    storage: row.storage!,
    priceCents: row.price_cents,
    bundleSize: row.bundle_size ?? 1,
    costPerPieceCents: Number(row.unit_cost_cents ?? 0),
    onHand: row.on_hand ?? 0,
    isNew: row.is_new ?? true,
    version: row.version!,
    lastBoughtBy: row.last_bought_by,
  }
}

export const itemsQueryKey = ['items'] as const

export function useItems() {
  return useQuery({
    queryKey: itemsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_overview')
        .select('*')
        .eq('archived', false)
        .order('type')
        .order('name')
      if (error) throw error
      return data.map(toItem)
    },
  })
}

/**
 * Give an item a price, which also takes it off the "Needs a price" list.
 *
 * The update carries the version the screen loaded, so a price someone else
 * changed in the meantime is not overwritten silently (see DATA_MODEL).
 */
export function useSetPrice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      version: number
      priceCents: number
      bundleSize: number
    }) => {
      const { data, error } = await supabase
        .from('items')
        .update({
          price_cents: input.priceCents,
          bundle_size: input.bundleSize,
        })
        .eq('id', input.id)
        .eq('version', input.version)
        .select('id')
      if (error) throw error
      if (data.length === 0) {
        throw new Error(
          'Someone else changed this item. Pull to refresh and try again.',
        )
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: itemsQueryKey }),
  })
}
