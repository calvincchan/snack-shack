/**
 * The Sale day screen: the lineup, Check stock, Start sale and Selling
 * (HANDOFF §4.1). The maths is in the database; this layer reads the views and
 * calls the sale day functions, whose error messages go on screen as they are.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { itemsQueryKey } from '@/lib/items'
import { todayDate } from '@/lib/time'
import type { Enums, Tables } from '@/lib/database.types'

export type ItemType = Enums<'item_type'>
export type CheckReason = Enums<'check_reason'>
export type Phase = Enums<'sale_phase'>

/** The four steps in the step bar, in order. */
export const STEPS = ['Lineup', 'Check stock', 'Sell', 'Count up'] as const

/**
 * How far along the step bar a phase is. Check stock is part of the lineup
 * phase in the database, so the bar counts steps, not phases: the volunteer
 * moves from Lineup to Check stock without anything being written.
 */
export function stepIndex(phase: Phase, checking: boolean): number {
  if (phase === 'lineup') return checking ? 1 : 0
  if (phase === 'selling') return 2
  return 3
}

type TotalsRow = Tables<'sale_day_lineup_totals'>

export type SaleDay = {
  id: string
  saleDate: string
  phase: Phase
  floatCents: number
  dayNo: number
  snacks: number
  treats: number
  /** Lineup items whose counted pieces differ from what the app expected. */
  itemsOff: number
  /** Weighted lineup margin (HANDOFF §5.6); null until something is picked. */
  margin: number | null
}

function toSaleDay(row: TotalsRow): SaleDay {
  return {
    id: row.sale_day_id!,
    saleDate: row.sale_date!,
    phase: row.phase!,
    floatCents: row.float_cents ?? 0,
    dayNo: row.day_no ?? 1,
    snacks: row.snacks ?? 0,
    treats: row.treats ?? 0,
    itemsOff: row.items_off ?? 0,
    margin: row.margin === null ? null : Number(row.margin),
  }
}

export const saleDayQueryKey = ['sale-day'] as const
export const lineupQueryKey = ['sale-day-lineup'] as const
export const optionsQueryKey = ['lineup-options'] as const

/** The one sale day that is open, if there is one (only one can be). */
export function useSaleDay() {
  return useQuery({
    queryKey: saleDayQueryKey,
    queryFn: async (): Promise<SaleDay | null> => {
      const { data, error } = await supabase
        .from('sale_day_lineup_totals')
        .select('*')
        .neq('phase', 'closed')
        .maybeSingle()
      if (error) throw error
      return data ? toSaleDay(data) : null
    },
  })
}

/** How long the Done screen stays up after Finish. */
const DONE_HOURS = 4

export const recentClosedQueryKey = ['recent-closed'] as const

/**
 * The sale day closed in the last few hours, if any, so both phones land on
 * Done after Finish and a reload does not lose it.
 */
export function useRecentlyClosed() {
  return useQuery({
    queryKey: recentClosedQueryKey,
    queryFn: async (): Promise<string | null> => {
      const since = new Date(Date.now() - DONE_HOURS * 3_600_000).toISOString()
      const { data, error } = await supabase
        .from('sale_days')
        .select('id')
        .eq('phase', 'closed')
        .gte('closed_at', since)
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
  })
}

export type LineupOption = {
  itemId: string
  name: string
  type: ItemType
  storage: Enums<'storage_kind'>
  priceCents: number
  bundleSize: number
  onHand: number
  /** New, Sold out lately, Slow seller, Not out for N sales — or none. */
  reason: string | null
  suggested: boolean
}

/** Everything a volunteer may pick: priced, active and with stock left. */
export function useLineupOptions() {
  return useQuery({
    queryKey: optionsQueryKey,
    queryFn: async (): Promise<LineupOption[]> => {
      const { data, error } = await supabase
        .from('lineup_options')
        .select('*')
        .order('score', { ascending: false })
        .order('name')
      if (error) throw error

      return data.map((row) => ({
        itemId: row.item_id!,
        name: row.name!,
        type: row.type!,
        storage: row.storage!,
        priceCents: row.price_cents!,
        bundleSize: row.bundle_size ?? 1,
        onHand: row.on_hand ?? 0,
        reason: row.reason,
        suggested: row.suggested ?? false,
      }))
    },
  })
}

export type LineupItem = {
  itemId: string
  name: string
  type: ItemType
  storage: Enums<'storage_kind'>
  priceCents: number
  bundleSize: number
  /** Pieces the app expects to find in the box. */
  expectedCount: number
  checkCount: number | null
  checkReason: CheckReason | null
  startCount: number | null
}

export function useLineup(saleDayId: string | undefined) {
  return useQuery({
    enabled: saleDayId !== undefined,
    queryKey: [...lineupQueryKey, saleDayId],
    queryFn: async (): Promise<LineupItem[]> => {
      const { data, error } = await supabase
        .from('sale_day_lineup')
        .select('*')
        .eq('sale_day_id', saleDayId!)
        .order('type')
        .order('name')
      if (error) throw error

      return data.map((row) => ({
        itemId: row.item_id!,
        name: row.name!,
        type: row.type!,
        storage: row.storage!,
        priceCents: row.price_cents!,
        bundleSize: row.bundle_size ?? 1,
        expectedCount: row.expected_count ?? 0,
        checkCount: row.check_count,
        checkReason: row.check_reason,
        startCount: row.start_count,
      }))
    },
  })
}

export type CheckDifference = {
  id: string
  name: string
  qty: number
  reason: string
}

/** What Check stock reported, shown again on the Selling screen. */
export function useCheckDifferences(saleDayId: string | undefined) {
  return useQuery({
    enabled: saleDayId !== undefined,
    queryKey: ['check-differences', saleDayId],
    queryFn: async (): Promise<CheckDifference[]> => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, qty, reason, items(name)')
        .eq('sale_day_id', saleDayId!)
        .in('reason', ['missing', 'damaged', 'found'])
        .order('created_at')
      if (error) throw error

      return data.map((row) => ({
        id: row.id,
        name: row.items?.name ?? 'An item',
        qty: row.qty,
        reason: row.reason,
      }))
    },
  })
}

/** "2 damaged (Nestlé mini bars, assorted)" for the Selling screen. */
export function differenceLabel(difference: CheckDifference): string {
  const pieces = Math.abs(difference.qty)
  const what =
    difference.reason === 'found'
      ? `${pieces} extra found`
      : `${pieces} ${difference.reason}`
  return `${what} (${difference.name})`
}

function useSaleDayMutation<TArgs>(run: (args: TArgs) => Promise<void>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: run,
    onSettled: () => {
      for (const key of [
        saleDayQueryKey,
        lineupQueryKey,
        optionsQueryKey,
        itemsQueryKey,
        ['open-sale-day'],
        ['check-differences'],
        recentClosedQueryKey,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}

/** Creates today's sale day, pre-filled with the suggested lineup. */
export function useCreateSaleDay() {
  return useSaleDayMutation<void>(async () => {
    const { error } = await supabase.rpc('create_sale_day', {
      p_date: todayDate(),
    })
    if (error) throw error
  })
}

export function useToggleLineupItem() {
  return useSaleDayMutation(
    async ({
      saleDayId,
      itemId,
      picked,
    }: {
      saleDayId: string
      itemId: string
      picked: boolean
    }) => {
      const { error } = picked
        ? await supabase
            .from('sale_day_items')
            .delete()
            .eq('sale_day_id', saleDayId)
            .eq('item_id', itemId)
        : await supabase
            .from('sale_day_items')
            .insert({ sale_day_id: saleDayId, item_id: itemId })
      if (error) throw error
    },
  )
}

/** Back to what the app suggested, for when the picking got away from you. */
export function useResetLineup() {
  return useSaleDayMutation(async (saleDayId: string) => {
    const { data: suggested, error: suggestError } = await supabase
      .from('lineup_options')
      .select('item_id')
      .eq('suggested', true)
    if (suggestError) throw suggestError

    const { error: clearError } = await supabase
      .from('sale_day_items')
      .delete()
      .eq('sale_day_id', saleDayId)
    if (clearError) throw clearError

    const { error } = await supabase.from('sale_day_items').insert(
      suggested.map((row) => ({
        sale_day_id: saleDayId,
        item_id: row.item_id!,
      })),
    )
    if (error) throw error
  })
}

/**
 * One item's counted pieces. A count that matches clears the row back to null,
 * which is how the database says "nothing to record".
 */
export function useSetCheckCount() {
  return useSaleDayMutation(
    async ({
      saleDayId,
      itemId,
      count,
      expected,
      reason,
    }: {
      saleDayId: string
      itemId: string
      count: number
      expected: number
      reason: CheckReason
    }) => {
      const matches = count === expected
      const { error } = await supabase
        .from('sale_day_items')
        .update({
          check_count: matches ? null : count,
          check_reason: matches || count > expected ? null : reason,
        })
        .eq('sale_day_id', saleDayId)
        .eq('item_id', itemId)
      if (error) throw error
    },
  )
}

export type StartSale = { saleDayId: string; floatCents: number | null }

/**
 * The float to pass to Start sale: only an amount that differs from the day's
 * current float. Null keeps it, so an untouched row writes nothing.
 */
export function floatToSend(
  countedCents: number | null,
  currentCents: number,
): number | null {
  return countedCents === null || countedCents === currentCents
    ? null
    : countedCents
}

export function useStartSale() {
  return useSaleDayMutation(async (start: StartSale) => {
    const { error } = await supabase.rpc('start_sale', {
      p_sale_day: start.saleDayId,
      p_float_cents: start.floatCents ?? undefined,
    })
    if (error) throw error
  })
}

export function useBeginCount() {
  return useSaleDayMutation(async (saleDayId: string) => {
    const { error } = await supabase.rpc('begin_count', {
      p_sale_day: saleDayId,
    })
    if (error) throw error
  })
}
