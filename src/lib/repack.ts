import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { itemsQueryKey, type Item } from '@/lib/items'
import type { NewItemDraft } from '@/components/new-item-fields'
import type { PriceOption } from '@/lib/pricing'

/** One item that went into a pack, and how many of its pieces each pack holds. */
export type RepackSource = { itemId: string; perPack: number }

/** The new item made by a repack, with the price it sells at. */
export type NewPackItem = NewItemDraft & PriceOption

export type Repack = {
  /** Client-generated, so a retry cannot repeat the repack. */
  id: string
  /** The pack item: an existing item's id, or a new item. */
  packItemId: string | null
  newItem: NewPackItem | null
  packs: number
  sources: RepackSource[]
}

/**
 * What one pack's pieces cost, in cents, possibly fractional. A display
 * estimate only: repack() works out the cost that is stored.
 */
export function costPerPackCents(
  sources: RepackSource[],
  items: Pick<Item, 'id' | 'costPerPieceCents'>[],
): number {
  return sources.reduce(
    (sum, source) =>
      sum +
      source.perPack *
        (items.find((item) => item.id === source.itemId)?.costPerPieceCents ??
          0),
    0,
  )
}

/** The stock each item gains or loses: − per source, + for the pack item. */
export function repackMoves(
  sources: RepackSource[],
  packs: number,
): { itemId: string; pieces: number }[] {
  return sources.map((source) => ({
    itemId: source.itemId,
    pieces: -packs * source.perPack,
  }))
}

/**
 * Record a repack (ADR-0019): `repack()` moves the stock and the cost into the
 * pack item in one transaction, making the item first if it is new. Safe to
 * retry with the same id.
 */
export function useRepack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (repack: Repack) => {
      const { error } = await supabase.rpc('repack', {
        p: {
          id: repack.id,
          pack_item_id: repack.packItemId,
          new_item: repack.newItem
            ? {
                name: repack.newItem.name.trim(),
                type: repack.newItem.type,
                storage: repack.newItem.storage,
                price_cents: repack.newItem.priceCents,
                bundle_size: repack.newItem.bundleSize,
              }
            : null,
          packs: repack.packs,
          sources: repack.sources.map((source) => ({
            item_id: source.itemId,
            pieces_per_pack: source.perPack,
          })),
        },
      })
      if (error) throw error
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: itemsQueryKey }),
  })
}
