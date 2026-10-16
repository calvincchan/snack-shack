/**
 * Insights (HANDOFF §4.5): read-only, term to date. Revenue comes from the
 * cash counts (ADR-0015), spending from claims, and the item picture from
 * stock counts (ADR-0016). The maths and the "What the numbers say" rules
 * (§5.8) live in Postgres views; this file reads them and words the rules.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toSaleDay, type SaleDay } from '@/lib/sale-day'
import type { Tables } from '@/lib/database.types'
import { formatCents } from '@/lib/money'

type TermRow = Tables<'insights_term'>
type MonthRow = Tables<'insights_months'>
type ItemRow = Tables<'insights_items'>

export type Term = {
  saleDays: number
  revenueCents: number
  claimsCents: number
  differenceCents: number
  revenuePerDayCents: number
}

export type Month = {
  /** First day of the month, "2026-09-01". */
  month: string
  revenueCents: number
  claimsCents: number
  differenceCents: number
}

/** An item counted on two different days. Estimates use today's price and cost. */
export type CountedItem = {
  id: string
  name: string
  piecesGone: number
  revenueEstimateCents: number | null
  /** Null while the item has no price. */
  margin: number | null
  /** A pack item (ADR-0019), shown with 🛍️. */
  madeByRepack: boolean
}

/** The facts behind each rule; a null or empty entry means it doesn't apply. */
export type Rules = {
  bestMonth: { month: string } | null
  trend: { differenceCents: number; usualCents: number } | null
  openCountOff: { saleDays: number } | null
  slowest: { name: string } | null
  lowMargin: { names: string[] }
}

export type Insights = {
  term: Term
  days: SaleDay[]
  months: Month[]
  items: CountedItem[]
  rules: Rules
}

export function toTerm(row: TermRow): Term {
  return {
    saleDays: row.sale_days ?? 0,
    revenueCents: row.revenue_cents ?? 0,
    claimsCents: row.claims_cents ?? 0,
    differenceCents: row.difference_cents ?? 0,
    revenuePerDayCents: row.revenue_per_day_cents ?? 0,
  }
}

export function toMonth(row: MonthRow): Month {
  return {
    month: row.month!,
    revenueCents: row.revenue_cents ?? 0,
    claimsCents: row.claims_cents ?? 0,
    differenceCents: row.difference_cents ?? 0,
  }
}

export function toCountedItem(row: ItemRow): CountedItem {
  return {
    id: row.item_id!,
    name: row.name!,
    piecesGone: row.pieces_gone ?? 0,
    revenueEstimateCents: row.revenue_estimate_cents,
    margin: row.margin,
    madeByRepack: row.made_by_repack ?? false,
  }
}

/** "September" from a month's first day, read piece by piece (no time zone). */
export function monthName(month: string): string {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number - 1, 1).toLocaleDateString('en-CA', {
    month: 'long',
  })
}

/** "Sep 2026", for the By month table. */
export function monthLabel(month: string): string {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number - 1, 1).toLocaleDateString('en-CA', {
    month: 'short',
    year: 'numeric',
  })
}

/** "+$12.00" or "−$3.50": a signed amount for differences. */
export function signedCents(cents: number): string {
  if (cents === 0) return formatCents(0)
  return `${cents > 0 ? '+' : '−'}${formatCents(Math.abs(cents))}`
}

/** One sentence per rule that applies, in the order of HANDOFF §5.8. */
export function sentences(rules: Rules): string[] {
  const out: string[] = []
  if (rules.bestMonth) {
    out.push(`${monthName(rules.bestMonth.month)} left the most after claims.`)
  }
  if (rules.trend) {
    const { differenceCents, usualCents } = rules.trend
    const amount = formatCents(Math.abs(differenceCents))
    out.push(
      `Revenue ${amount} ${differenceCents > 0 ? 'above' : 'below'} the usual ${formatCents(usualCents)}.`,
    )
  }
  if (rules.openCountOff) {
    const n = rules.openCountOff.saleDays
    out.push(
      `${n} ${n === 1 ? 'sale day' : 'sale days'} opened with a different amount than was left in the box. Check the box between sale days.`,
    )
  }
  if (rules.slowest) {
    out.push(
      `${rules.slowest.name} moved the slowest. Try a lower price on the Items tab.`,
    )
  }
  if (rules.lowMargin.names.length > 0) {
    out.push(
      `Low margin and restocked since the last count: ${rules.lowMargin.names.join(', ')}.`,
    )
  }
  return out
}

/** Everything the Insights tab shows, in one load. */
export function useInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn: async (): Promise<Insights> => {
      const [term, days, months, items, best, trend, off, slow, low] =
        await Promise.all([
          supabase.from('insights_term').select('*').single(),
          supabase
            .from('sale_day_cash')
            .select('*')
            .eq('phase', 'closed')
            .order('sale_date', { ascending: false }),
          supabase
            .from('insights_months')
            .select('*')
            .order('month', { ascending: false }),
          supabase.from('insights_items').select('*').order('name'),
          supabase.from('insights_best_month').select('*').maybeSingle(),
          supabase.from('insights_revenue_trend').select('*').maybeSingle(),
          supabase.from('insights_open_count_off').select('*').maybeSingle(),
          supabase.from('insights_slowest_item').select('*').maybeSingle(),
          supabase.from('insights_low_margin_items').select('*').order('name'),
        ])
      for (const result of [
        term,
        days,
        months,
        items,
        best,
        trend,
        off,
        slow,
        low,
      ]) {
        if (result.error) throw result.error
      }
      return {
        term: toTerm(term.data!),
        days: days.data!.map(toSaleDay),
        months: months.data!.map(toMonth),
        items: items.data!.map(toCountedItem),
        rules: {
          bestMonth: best.data ? { month: best.data.month! } : null,
          trend: trend.data
            ? {
                differenceCents: trend.data.difference_cents!,
                usualCents: trend.data.usual_cents!,
              }
            : null,
          openCountOff: off.data ? { saleDays: off.data.sale_days! } : null,
          slowest: slow.data ? { name: slow.data.name! } : null,
          lowMargin: { names: low.data!.map((row) => row.name!) },
        },
      }
    },
  })
}
