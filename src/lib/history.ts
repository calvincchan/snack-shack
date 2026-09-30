/**
 * Change history for the sale day and item sheets (HANDOFF §6). The database
 * decides what counts as a change (`change_history`); this file words it.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/database.types'
import { priceLabel } from '@/lib/pricing'

type HistoryRow = Tables<'change_history'>

export type HistoryEntry = {
  /** The audit row plus the field: one edit can change several fields. */
  key: string
  text: string
  /** "Yuki", or "Someone" when the actor is unknown. */
  who: string
  at: string
}

/** "100/2" from the view is "2 for $1". */
function priceOf(value: string | null): string {
  if (!value) return 'no price'
  const [cents, bundle] = value.split('/').map(Number)
  return priceLabel(cents, bundle)
}

function quote(value: string | null): string {
  return `“${value ?? ''}”`
}

const PHASES: Record<string, string> = {
  selling: 'Sale started',
  counting: 'Count up started',
  closed: 'Sale day closed',
}

/**
 * One line of history: "BBQ chips count changed 14 → 12". `withItem` puts the
 * item's name first, for the sale day sheet where several items share a list.
 */
export function describeChange(
  row: Pick<HistoryRow, 'field' | 'old_value' | 'new_value' | 'item_name'>,
  { withItem = false } = {},
): string {
  const { old_value: from, new_value: to } = row
  const item = row.item_name ?? 'Item'
  const lead = withItem ? `${item} ` : ''
  const arrow = `${from ?? '–'} → ${to}`

  switch (row.field) {
    case 'name':
      return `${lead}renamed ${quote(from)} → ${quote(to)}`.trim()
    case 'price':
      return `${lead}price changed ${priceOf(from)} → ${priceOf(to)}`
    case 'type':
      return `${lead}type changed ${arrow}`
    case 'storage':
      return `${lead}storage changed ${arrow}`
    case 'archived':
      return to === 'true' ? `${lead}archived` : `${lead}put back on the list`
    case 'check_count':
      return from === null
        ? `${lead}checked at ${to}`
        : `${lead}check changed ${arrow}`
    case 'left_count':
      return `${lead}count changed ${arrow}`
    case 'phase':
      return PHASES[to ?? ''] ?? `Sale day moved to ${to}`
    default:
      return `${lead}${row.field} changed ${arrow}`
  }
}

/** Sentence case: the item name may already lead, but the rest may not. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function toEntries(
  rows: HistoryRow[],
  options: { withItem?: boolean } = {},
): HistoryEntry[] {
  return rows.map((row) => ({
    key: `${row.id}:${row.field}`,
    text: sentence(describeChange(row, options)),
    who: row.actor_name ?? 'Someone',
    at: row.at!,
  }))
}

/**
 * "12:58" for something that happened today, "Sep 29, 12:58" otherwise.
 * `now` is a parameter so it can be tested.
 */
export function formatWhen(at: string, now: Date = new Date()): string {
  const when = new Date(at)
  const time = when.toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
  })
  if (when.toDateString() === now.toDateString()) return time
  const day = when.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
  })
  return `${day}, ${time}`
}

const LIMIT = 50

async function fetchHistory(
  column: 'item_id' | 'sale_day_id',
  id: string,
): Promise<HistoryRow[]> {
  const { data, error } = await supabase
    .from('change_history')
    .select('*')
    .eq(column, id)
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .limit(LIMIT)
  if (error) throw error
  return data
}

export type HistoryScope = { kind: 'item' | 'sale-day'; id: string }

/**
 * Everything that changed on one item (across sale days), or the counts and
 * phase changes on one sale day.
 */
export function useHistory({ kind, id }: HistoryScope, enabled: boolean) {
  return useQuery({
    queryKey: ['history', kind, id],
    enabled,
    queryFn: async () =>
      kind === 'item'
        ? toEntries(await fetchHistory('item_id', id))
        : toEntries(await fetchHistory('sale_day_id', id), { withItem: true }),
  })
}
