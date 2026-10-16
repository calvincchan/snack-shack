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
  /** The ledger total. Only exact right after a stock count. */
  onHand: number
  lastCountedAt: string | null
  lastCountedPieces: number | null
  /** Purchases minus returns since the last count (all of them if never counted). */
  boughtSince: number
  /** Pieces gone between the last two counts; null until counted twice. */
  piecesGone: number | null
  /** Net repacked pieces since the last count: + made, − used (ADR-0019). */
  repackedSince: number
  /** A pack item: a repack made it (ADR-0019). Shown with 🛍️. */
  madeByRepack: boolean
  /** Has gone into a repack. With no price, the item is Repack only. */
  inRepacks: boolean
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
    lastCountedAt: row.last_counted_at,
    lastCountedPieces: row.last_counted_pieces,
    boughtSince: row.bought_since ?? 0,
    piecesGone: row.pieces_gone,
    repackedSince: row.repacked_since ?? 0,
    madeByRepack: row.made_by_repack ?? false,
    inRepacks: row.in_repacks ?? false,
    isNew: row.is_new ?? true,
    archived: row.archived ?? false,
    version: row.version!,
    lastBoughtBy: row.last_bought_by,
    updatedByName: row.updated_by_name,
    updatedAt: row.updated_at,
  }
}

const shortDate = (when: string) =>
  new Date(when).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Vancouver',
  })

/** "Counted 24 on Oct 1 · bought 48 since", or "Not counted · bought 48". */
export function stockLine(
  item: Pick<
    Item,
    'lastCountedAt' | 'lastCountedPieces' | 'boughtSince' | 'repackedSince'
  >,
): string {
  const repacked = item.repackedSince
    ? ` · repacked ${signedPieces(item.repackedSince)}`
    : ''
  if (item.lastCountedAt === null || item.lastCountedPieces === null) {
    return `Not counted · bought ${item.boughtSince}${repacked}`
  }
  return `Counted ${item.lastCountedPieces} on ${shortDate(item.lastCountedAt)} · bought ${item.boughtSince} since${repacked}`
}

/** "+31", "−155" (a true minus sign). */
export function signedPieces(pieces: number): string {
  return pieces > 0 ? `+${pieces}` : `−${Math.abs(pieces)}`
}

/** "Last counted 24 on Oct 1", or null when never counted. */
export function lastCountedLine(
  item: Pick<Item, 'lastCountedAt' | 'lastCountedPieces'>,
): string | null {
  if (item.lastCountedAt === null || item.lastCountedPieces === null)
    return null
  return `Last counted ${item.lastCountedPieces} on ${shortDate(item.lastCountedAt)}`
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

/** The editable fields of an item, as they are now. */
export function editOf(item: Item): ItemEdit {
  return {
    name: item.name,
    type: item.type,
    storage: item.storage,
    priceCents: item.priceCents,
    bundleSize: item.bundleSize,
  }
}

/** Not priced yet. Repack only items need no price. */
export function needsPrice(item: Pick<Item, 'priceCents' | 'inRepacks'>) {
  return item.priceCents === null && !item.inRepacks
}

/** No price and has gone into a repack: never sold on its own. */
export function isRepackOnly(item: Pick<Item, 'priceCents' | 'inRepacks'>) {
  return item.priceCents === null && item.inRepacks
}

/** The name as shown: "🛍️ Candy pack" for a pack item. Never saved. */
export function itemName(item: { name: string; madeByRepack: boolean }) {
  return item.madeByRepack ? `🛍️ ${item.name}` : item.name
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

/** Save a stock count: only the items given post a movement. Returns how many. */
export function useSaveStockCount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (counts: { itemId: string; pieces: number }[]) => {
      const { data, error } = await supabase.rpc('save_stock_count', {
        p_counts: counts.map((c) => ({ item_id: c.itemId, pieces: c.pieces })),
      })
      if (error) throw error
      return data
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: itemsQueryKey }),
  })
}
