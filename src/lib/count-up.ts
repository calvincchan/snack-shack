/**
 * Count up (HANDOFF §4.1, §5.7): reads the results and totals views and writes
 * the counts. The maths is in the database; the only rules here are how the
 * numbers are shown and when Finish is allowed.
 */
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCents } from '@/lib/money'
import {
  lineupQueryKey,
  optionsQueryKey,
  recentClosedQueryKey,
  saleDayQueryKey,
  type ItemType,
} from '@/lib/sale-day'
import { itemsQueryKey } from '@/lib/items'
import type { Tables } from '@/lib/database.types'

export const COUNT_KEY = ['count'] as const

export type CountWrite =
  | {
      kind: 'left-out'
      saleDayId: string
      itemId: string
      left: number
      out: number
    }
  | { kind: 'cash'; saleDayId: string; denomCents: number; qty: number }
  | { kind: 'helper-credits'; saleDayId: string; credits: number }
  | { kind: 'note'; saleDayId: string; note: string }

function run(write: CountWrite) {
  switch (write.kind) {
    case 'left-out':
      return supabase
        .from('sale_day_items')
        .update({ left_count: write.left, out_count: write.out })
        .eq('sale_day_id', write.saleDayId)
        .eq('item_id', write.itemId)
    case 'cash':
      return supabase
        .from('cash_counts')
        .update({ qty: write.qty })
        .eq('sale_day_id', write.saleDayId)
        .eq('denom_cents', write.denomCents)
    case 'helper-credits':
      return supabase
        .from('sale_days')
        .update({ helper_credits: write.credits })
        .eq('id', write.saleDayId)
    case 'note':
      return supabase
        .from('sale_days')
        .update({
          note: write.note.trim() === '' ? null : write.note.trim(),
        })
        .eq('id', write.saleDayId)
  }
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

async function send(write: CountWrite): Promise<void> {
  const { error } = await run(write)
  if (error) throw new Error(countErrorMessage(error))
}

/** What the count up reads, refreshed after a write settles. */
export const totalsKey = ['sale-day-totals'] as const
export const resultsKey = ['sale-day-results'] as const
export const cashKey = ['cash-counts'] as const
export const signoffsKey = ['signoffs'] as const

const countReadKeys = [
  totalsKey,
  resultsKey,
  cashKey,
  signoffsKey,
  ['sale-day-notes'],
  saleDayQueryKey,
  recentClosedQueryKey,
  lineupQueryKey,
  optionsQueryKey,
  itemsQueryKey,
  ['open-sale-day'],
]

export function invalidateCountReads(client: QueryClient) {
  for (const queryKey of countReadKeys) {
    void client.invalidateQueries({ queryKey })
  }
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
  { cents: 2000, label: '$20 Bill' },
  { cents: 1000, label: '$10 Bill' },
  { cents: 500, label: '$5 Bill' },
  { cents: 200, label: '$2 Toonie' },
  { cents: 100, label: '$1 Loonie' },
  { cents: 25, label: '¢25 Quarter' },
  { cents: 10, label: '¢10 Dime' },
  { cents: 5, label: '¢5 Nickel' },
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

/** Sign-off and Finish change the phase, so they need the database's answer. */
function usePhaseMutation(run: (saleDayId: string) => Promise<void>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: run,
    networkMode: 'always',
    onSettled: () => invalidateCountReads(queryClient),
  })
}

/**
 * A plain online write. The scope keeps writes to one row in order, so the
 * last edit wins. Each write sets an absolute value, so a repeat is harmless.
 */
function useCountWrite<T extends CountWrite>(kind: T['kind'], scope: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, T>({
    mutationKey: [...COUNT_KEY, kind],
    mutationFn: send,
    scope: { id: scope },
    networkMode: 'always',
    // A refused write must keep showing "Not saved" until its row saves again.
    gcTime: Infinity,
    onSettled: () => invalidateCountReads(queryClient),
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
