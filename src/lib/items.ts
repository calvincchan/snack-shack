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
  archived: boolean
  version: number
  lastBoughtBy: string | null
  updatedByName: string | null
  updatedAt: string | null
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
    archived: row.archived ?? false,
    version: row.version!,
    lastBoughtBy: row.last_bought_by,
    updatedByName: row.updated_by_name,
    updatedAt: row.updated_at,
  }
}

export const itemsQueryKey = ['items'] as const

export function useItems({ includeArchived = false } = {}) {
  return useQuery({
    queryKey: [...itemsQueryKey, { includeArchived }],
    queryFn: async () => {
      let query = supabase.from('item_overview').select('*')
      if (!includeArchived) query = query.eq('archived', false)
      const { data, error } = await query.order('type').order('name')
      if (error) throw error
      return data.map(toItem)
    },
  })
}

export type ItemEdit = {
  name: string
  type: Enums<'item_type'>
  storage: Enums<'storage_kind'>
  priceCents: number | null
  bundleSize: number
}

/** Someone else saved first; the caller decides whose edit wins. */
export class ItemChangedError extends Error {
  /** The item as it stands now, so the prompt can name who changed what. */
  current: Item

  constructor(current: Item) {
    super('This item changed while you were editing it.')
    this.name = 'ItemChangedError'
    this.current = current
  }
}

async function readItem(id: string): Promise<Item> {
  const { data, error } = await supabase
    .from('item_overview')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return toItem(data)
}

/**
 * Save an edit, but only if nobody else has saved since the screen loaded.
 *
 * The update carries the version it loaded (see DATA_MODEL): zero rows changed
 * means someone got there first, so the caller is handed their row and asks
 * the volunteer whose edit to keep.
 */
export function useSaveItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      version,
      edit,
    }: {
      id: string
      version: number
      edit: ItemEdit
    }) => {
      const { data, error } = await supabase
        .from('items')
        .update({
          name: edit.name,
          type: edit.type,
          storage: edit.storage,
          price_cents: edit.priceCents,
          bundle_size: edit.bundleSize,
        })
        .eq('id', id)
        .eq('version', version)
        .select('id')
      if (error) throw error
      if (data.length === 0) throw new ItemChangedError(await readItem(id))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: itemsQueryKey }),
  })
}

export function useSetArchived() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('items')
        .update({ archived })
        .eq('id', id)
      if (error) throw error
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: itemsQueryKey }),
  })
}
