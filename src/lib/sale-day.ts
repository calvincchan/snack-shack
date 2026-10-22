/**
 * The Sale day screen (HANDOFF §4.1, ADR-0015): an open count, selling, a
 * close count. The maths is in the `sale_day_cash` view; this layer reads it,
 * writes one cash row at a time and calls the sale day functions, whose error
 * messages go on screen as they are.
 */
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Enums, Tables } from '@/lib/database.types'

export type Phase = Enums<'sale_phase'>
export type CountKind = Enums<'cash_count_kind'>

type CashRow = Tables<'sale_day_cash'>

/** One sale day's numbers. Revenue and deposit are null until they apply. */
export type SaleDay = {
  id: string
  saleDate: string
  phase: Phase
  /** Selling has started, so the open count is done and locked. */
  selling: boolean
  closedAt: string | null
  openCents: number
  closeCents: number
  revenueCents: number
  leftInBoxCents: number | null
  depositCents: number | null
  /** What was left in the box after the previous sale day, if there was one. */
  expectedOpenCents: number | null
  openDiffCents: number | null
  openNote: string | null
  closeNote: string | null
  openedBy: string | null
  closedBy: string | null
}

export function toSaleDay(row: CashRow): SaleDay {
  return {
    id: row.sale_day_id!,
    saleDate: row.sale_date!,
    phase: row.phase!,
    selling: row.selling_at !== null,
    closedAt: row.closed_at,
    openCents: row.open_cents ?? 0,
    closeCents: row.close_cents ?? 0,
    revenueCents: row.revenue_cents ?? 0,
    leftInBoxCents: row.left_in_box_cents,
    depositCents: row.deposit_cents,
    expectedOpenCents: row.expected_open_cents,
    openDiffCents: row.open_diff_cents,
    openNote: row.open_note,
    closeNote: row.close_note,
    openedBy: row.opened_by_name,
    closedBy: row.closed_by_name,
  }
}

/** Bills and coins, biggest first. */
export const DENOMINATIONS = [
  { cents: 2000, label: '$20 Bill' },
  { cents: 1000, label: '$10 Bill' },
  { cents: 500, label: '$5 Bill' },
  { cents: 200, label: '$2 Toonie' },
  { cents: 100, label: '$1 Loonie' },
  { cents: 25, label: '25¢ Quarter' },
  { cents: 10, label: '10¢ Dime' },
  { cents: 5, label: '5¢ Nickel' },
] as const

/** "$2.00 less than left last time", or null when it matches or can't be compared. */
export function openDiffLabel(
  diffCents: number | null,
  format: (cents: number) => string,
): string | null {
  if (diffCents === null || diffCents === 0) return null
  return `${format(Math.abs(diffCents))} ${diffCents < 0 ? 'less' : 'more'} than left last time`
}

export const saleDayQueryKey = ['sale-day'] as const
export const lastClosedQueryKey = ['sale-day-last-closed'] as const
export const recentClosedQueryKey = ['recent-closed'] as const
export const cashKey = ['cash-counts'] as const
export const changeFloatKey = ['settings', 'change-float'] as const

/** Every query that reads sale day rows, for Realtime and after a write. */
export const SALE_DAY_KEYS = [
  saleDayQueryKey,
  lastClosedQueryKey,
  recentClosedQueryKey,
  cashKey,
  ['sale-day-history'],
]

export function invalidateSaleDay(client: QueryClient) {
  for (const queryKey of SALE_DAY_KEYS) {
    void client.invalidateQueries({ queryKey })
  }
}

/** The one sale day that is open, if there is one (only one can be). */
export function useSaleDay() {
  return useQuery({
    queryKey: saleDayQueryKey,
    queryFn: async (): Promise<SaleDay | null> => {
      const { data, error } = await supabase
        .from('sale_day_cash')
        .select('*')
        .eq('phase', 'open')
        .maybeSingle()
      if (error) throw error
      return data ? toSaleDay(data) : null
    },
  })
}

/** The latest closed sale day by date, for the start screen. */
export function useLastClosed() {
  return useQuery({
    queryKey: lastClosedQueryKey,
    queryFn: async (): Promise<SaleDay | null> => {
      const { data, error } = await supabase
        .from('sale_day_cash')
        .select('*')
        .eq('phase', 'closed')
        .order('sale_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? toSaleDay(data) : null
    },
  })
}

/** How long the Done screen stays up after closing. */
const DONE_HOURS = 4

/**
 * The sale day closed in the last few hours, if any, so both phones land on
 * Done after closing and a reload does not lose it.
 */
export function useRecentlyClosed() {
  return useQuery({
    queryKey: recentClosedQueryKey,
    queryFn: async (): Promise<SaleDay | null> => {
      const since = new Date(Date.now() - DONE_HOURS * 3_600_000).toISOString()
      const { data, error } = await supabase
        .from('sale_day_cash')
        .select('*')
        .eq('phase', 'closed')
        .gte('closed_at', since)
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? toSaleDay(data) : null
    },
  })
}

/** Quantity per denomination for one count. */
export function useCashCounts(saleDayId: string, kind: CountKind) {
  return useQuery({
    queryKey: [...cashKey, saleDayId, kind],
    queryFn: async (): Promise<Record<number, number>> => {
      const { data, error } = await supabase
        .from('cash_counts')
        .select('denom_cents, qty')
        .eq('sale_day_id', saleDayId)
        .eq('kind', kind)
      if (error) throw error
      return Object.fromEntries(data.map((row) => [row.denom_cents, row.qty]))
    },
  })
}

/** The change float setting: the default for left in box. */
export function useChangeFloat() {
  return useQuery({
    queryKey: changeFloatKey,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('settings')
        .select('float_cents')
        .single()
      if (error) throw error
      return data.float_cents
    },
  })
}

// Cash count writes -------------------------------------------------------------

export const COUNT_KEY = ['count'] as const

export type CashWrite = {
  saleDayId: string
  kind: CountKind
  denomCents: number
  qty: number
}

/** A dropped connection gets plain words; a database refusal is shown as-is. */
export function countErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : ''
  return /failed to fetch|load failed|network/i.test(message)
    ? 'No connection. Change not saved.'
    : message
}

async function sendCash(write: CashWrite): Promise<void> {
  const { error } = await supabase
    .from('cash_counts')
    .update({ qty: write.qty })
    .eq('sale_day_id', write.saleDayId)
    .eq('kind', write.kind)
    .eq('denom_cents', write.denomCents)
  if (error) throw new Error(countErrorMessage(error))
}

export type CountSyncStatus = 'saved' | 'saving' | 'failed'

/**
 * "Saving" while any write is in flight. "Failed" while a row's latest write
 * was refused and nothing has saved that row since; the next edit clears it.
 */
export function countSyncStatus(
  writes: {
    options: { scope?: { id: string } }
    state: { status: string; submittedAt: number }
  }[],
): CountSyncStatus {
  if (writes.some((w) => w.state.status === 'pending')) return 'saving'
  const latest = new Map<string, (typeof writes)[number]>()
  for (const w of writes) {
    const row = w.options.scope?.id ?? ''
    const seen = latest.get(row)
    if (!seen || w.state.submittedAt >= seen.state.submittedAt) {
      latest.set(row, w)
    }
  }
  return [...latest.values()].some((w) => w.state.status === 'error')
    ? 'failed'
    : 'saved'
}

export function useCountSyncStatus(): CountSyncStatus {
  const writes = useMutationState({
    filters: { mutationKey: COUNT_KEY },
    select: (m) => ({
      options: { scope: m.options.scope },
      state: { status: m.state.status, submittedAt: m.state.submittedAt },
    }),
  })
  return countSyncStatus(writes)
}

/**
 * A plain online write of one denomination's count (ADR-0012). The scope keeps
 * writes to one row in order, so the last edit wins; each sets an absolute
 * value, so a repeat is harmless.
 */
export function useSetCash(kind: CountKind, denomCents: number) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, CashWrite>({
    mutationKey: [...COUNT_KEY, kind, denomCents],
    mutationFn: sendCash,
    scope: { id: `${kind}:${denomCents}` },
    networkMode: 'always',
    // A refused write must keep showing "Not saved" until its row saves again.
    gcTime: Infinity,
    onSettled: () => invalidateSaleDay(queryClient),
  })
}

// Phase changes -----------------------------------------------------------------

function usePhaseMutation<TArgs>(run: (args: TArgs) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    networkMode: 'always',
    onSettled: () => invalidateSaleDay(queryClient),
  })
}

export function useOpenSaleDay() {
  return usePhaseMutation(async (date: string) => {
    const { error } = await supabase.rpc('open_sale_day', { p_date: date })
    if (error) throw error
  })
}

export function useCancelSaleDay() {
  return usePhaseMutation(async (saleDayId: string) => {
    const { error } = await supabase.rpc('cancel_sale_day', {
      p_sale_day: saleDayId,
    })
    if (error) throw error
  })
}

export function useStartSelling() {
  return usePhaseMutation(
    async ({ saleDayId, note }: { saleDayId: string; note: string }) => {
      const { error } = await supabase.rpc('start_selling', {
        p_sale_day: saleDayId,
        p_note: note,
      })
      if (error) throw error
    },
  )
}

export function useCloseSaleDay() {
  return usePhaseMutation(
    async ({
      saleDayId,
      leftInBoxCents,
      note,
    }: {
      saleDayId: string
      leftInBoxCents: number
      note: string
    }) => {
      const { error } = await supabase.rpc('close_sale_day', {
        p_sale_day: saleDayId,
        p_left_in_box_cents: leftInBoxCents,
        p_note: note,
      })
      if (error) throw error
    },
  )
}
