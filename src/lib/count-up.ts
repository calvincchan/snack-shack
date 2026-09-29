/**
 * Count up (HANDOFF §4.1, §5.7): reads the results and totals views and writes
 * the counts. The maths is in the database; the only rules here are how the
 * numbers are shown and when Finish is allowed.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCents } from '@/lib/money'
import type { ItemType } from '@/lib/sale-day'
import {
  COUNT_KEY,
  cashKey,
  invalidateCountReads,
  resultsKey,
  signoffsKey,
  totalsKey,
  type CountWrite,
} from '@/lib/count-queue'
import type { Tables } from '@/lib/database.types'

export type OverShort = 'ok' | 'warn' | 'bad'

/** Within the first threshold is fine, within the second means recount once. */
export function overShortStatus(
  cents: number,
  okCents: number,
  warnCents: number,
): OverShort {
  const off = Math.abs(cents)
  if (off <= okCents) return 'ok'
  return off <= warnCents ? 'warn' : 'bad'
}

export function overShortLabel(cents: number): string {
  if (cents === 0) return 'Spot on'
  return `${cents > 0 ? 'Over' : 'Short'} ${formatCents(Math.abs(cents))}`
}

/** "Sold 24 pcs = 12 deals · $12.00", or "Sold 20 · $20.00" for single items. */
export function soldLabel(
  soldPieces: number,
  bundleSize: number,
  salesCents: number,
): string {
  const money = formatCents(salesCents)
  if (bundleSize <= 1) return `Sold ${soldPieces} · ${money}`
  const deals = Math.round((soldPieces / bundleSize) * 100) / 100
  return `Sold ${soldPieces} pcs = ${deals} ${deals === 1 ? 'deal' : 'deals'} · ${money}`
}

export function canFinish(totals: {
  signoffs: number
  itemsOverStart: number
  itemsUncounted: number
}): boolean {
  return (
    totals.signoffs >= 1 &&
    totals.itemsOverStart === 0 &&
    totals.itemsUncounted === 0
  )
}

/** Coins and bills counted at the end, biggest first. */
export const DENOMINATIONS = [
  { cents: 2000, label: '$20' },
  { cents: 1000, label: '$10' },
  { cents: 500, label: '$5' },
  { cents: 200, label: 'Toonie' },
  { cents: 100, label: 'Loonie' },
  { cents: 25, label: 'Quarter' },
  { cents: 10, label: 'Dime' },
  { cents: 5, label: 'Nickel' },
] as const

type TotalsRow = Tables<'sale_day_totals'>

export type Totals = {
  piecesSold: number
  salesCents: number
  helperCredits: number
  floatCents: number
  expectedCents: number
  countedCents: number
  overShortCents: number
  depositCents: number
  itemsOverStart: number
  itemsUncounted: number
  signoffs: number
}

function toTotals(row: TotalsRow): Totals {
  return {
    piecesSold: row.pieces_sold ?? 0,
    salesCents: row.sales_cents ?? 0,
    helperCredits: row.helper_credits ?? 0,
    floatCents: row.float_cents ?? 0,
    expectedCents: row.expected_cents ?? 0,
    countedCents: row.counted_cents ?? 0,
    overShortCents: row.over_short_cents ?? 0,
    depositCents: row.deposit_cents ?? 0,
    itemsOverStart: row.items_over_start ?? 0,
    itemsUncounted: row.items_uncounted ?? 0,
    signoffs: row.signoffs ?? 0,
  }
}

export function useTotals(saleDayId: string | undefined) {
  return useQuery({
    enabled: saleDayId !== undefined,
    queryKey: [...totalsKey, saleDayId],
    queryFn: async (): Promise<Totals> => {
      const { data, error } = await supabase
        .from('sale_day_totals')
        .select('*')
        .eq('sale_day_id', saleDayId!)
        .single()
      if (error) throw error
      return toTotals(data)
    },
  })
}

export type Thresholds = { okCents: number; warnCents: number }

export function useThresholds() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Thresholds> => {
      const { data, error } = await supabase
        .from('settings')
        .select('over_short_ok_cents, over_short_warn_cents')
        .single()
      if (error) throw error
      return {
        okCents: data.over_short_ok_cents,
        warnCents: data.over_short_warn_cents,
      }
    },
  })
}

export type CountItem = {
  itemId: string
  name: string
  type: ItemType
  bundleSize: number
  startCount: number
  leftCount: number
  outCount: number
  soldPieces: number
  salesCents: number
}

export function useCountItems(saleDayId: string) {
  return useQuery({
    queryKey: [...resultsKey, saleDayId],
    queryFn: async (): Promise<CountItem[]> => {
      const [results, lineup] = await Promise.all([
        supabase
          .from('sale_day_item_results')
          .select('*')
          .eq('sale_day_id', saleDayId),
        supabase
          .from('sale_day_lineup')
          .select('item_id, name')
          .eq('sale_day_id', saleDayId),
      ])
      if (results.error) throw results.error
      if (lineup.error) throw lineup.error

      const names = new Map(lineup.data.map((row) => [row.item_id!, row.name!]))
      return results.data
        .map((row) => ({
          itemId: row.item_id!,
          name: names.get(row.item_id!) ?? 'An item',
          type: row.locked_type!,
          bundleSize: row.locked_bundle_size ?? 1,
          startCount: row.start_count ?? 0,
          leftCount: row.left_count ?? row.start_count ?? 0,
          outCount: row.out_count ?? 0,
          soldPieces: row.sold_pieces ?? 0,
          salesCents: row.sales_cents ?? 0,
        }))
        .sort(
          (a, b) =>
            a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
        )
    },
  })
}

export function useCashCounts(saleDayId: string) {
  return useQuery({
    queryKey: [...cashKey, saleDayId],
    queryFn: async (): Promise<Record<number, number>> => {
      const { data, error } = await supabase
        .from('cash_counts')
        .select('denom_cents, qty')
        .eq('sale_day_id', saleDayId)
      if (error) throw error
      return Object.fromEntries(data.map((row) => [row.denom_cents, row.qty]))
    },
  })
}

export type SaleDayNotes = { helperCredits: number; note: string }

export function useSaleDayNotes(saleDayId: string) {
  return useQuery({
    queryKey: ['sale-day-notes', saleDayId],
    queryFn: async (): Promise<SaleDayNotes> => {
      const { data, error } = await supabase
        .from('sale_days')
        .select('helper_credits, note')
        .eq('id', saleDayId)
        .single()
      if (error) throw error
      return { helperCredits: data.helper_credits, note: data.note ?? '' }
    },
  })
}

export type Signoff = { userId: string; name: string }

export function useSignoffs(saleDayId: string) {
  return useQuery({
    queryKey: [...signoffsKey, saleDayId],
    queryFn: async (): Promise<Signoff[]> => {
      const [signoffs, profiles] = await Promise.all([
        supabase
          .from('sale_day_signoffs')
          .select('user_id')
          .eq('sale_day_id', saleDayId)
          .order('signed_at'),
        supabase.from('profiles').select('id, display_name'),
      ])
      if (signoffs.error) throw signoffs.error
      if (profiles.error) throw profiles.error

      const names = new Map(profiles.data.map((p) => [p.id, p.display_name]))
      return signoffs.data.map((row) => ({
        userId: row.user_id,
        name: names.get(row.user_id) ?? 'A volunteer',
      }))
    },
  })
}

/** Sign-off and Finish need the database's answer, so they are never queued. */
function usePhaseMutation(run: (saleDayId: string) => Promise<void>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: run,
    networkMode: 'always',
    onSettled: () => invalidateCountReads(queryClient),
  })
}

/** A queued write: waits while offline and sends in order when Wi-Fi returns. */
function useCountWrite<T extends CountWrite>(kind: T['kind'], scope: string) {
  return useMutation<void, Error, T>({
    mutationKey: [...COUNT_KEY, kind],
    scope: { id: scope },
  })
}

export function useSetLeftOut(itemId: string) {
  return useCountWrite<Extract<CountWrite, { kind: 'left-out' }>>(
    'left-out',
    `item:${itemId}`,
  )
}

export function useSetCash() {
  return useCountWrite<Extract<CountWrite, { kind: 'cash' }>>('cash', 'cash')
}

export function useSetHelperCredits() {
  return useCountWrite<Extract<CountWrite, { kind: 'helper-credits' }>>(
    'helper-credits',
    'helper-credits',
  )
}

export function useSetNote() {
  return useCountWrite<Extract<CountWrite, { kind: 'note' }>>('note', 'note')
}

export function useSignOff() {
  return usePhaseMutation(async (saleDayId) => {
    const { error } = await supabase.rpc('sign_off', { p_sale_day: saleDayId })
    if (error) throw error
  })
}

export function useFinishCount() {
  return usePhaseMutation(async (saleDayId) => {
    const { error } = await supabase.rpc('close_sale_day', {
      p_sale_day: saleDayId,
    })
    if (error) throw error
  })
}
