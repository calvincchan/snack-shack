/**
 * Insights (HANDOFF §4.5): read-only, term to date. Every number comes from an
 * `insights_*` view (ADR-0008); this file only reads them.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/database.types'

export type InsightsTerm = {
  saleDays: number
  salesCents: number
  profitCents: number
  helperCreditCents: number
  piecesSold: number
  overShortCents: number
  salesOutsideOk: number
  overShortOkCents: number
  salesPerDayCents: number
  piecesPerDay: number
  marginPct: number | null
}

type TermRow = Tables<'insights_term'>

function toTerm(row: TermRow): InsightsTerm {
  return {
    saleDays: row.sale_days ?? 0,
    salesCents: row.sales_cents ?? 0,
    profitCents: row.profit_cents ?? 0,
    helperCreditCents: row.helper_credit_cents ?? 0,
    piecesSold: row.pieces_sold ?? 0,
    overShortCents: row.over_short_cents ?? 0,
    salesOutsideOk: row.sales_outside_ok ?? 0,
    overShortOkCents: row.over_short_ok_cents ?? 0,
    salesPerDayCents: row.sales_per_day_cents ?? 0,
    piecesPerDay: row.pieces_per_day ?? 0,
    marginPct: row.margin_pct,
  }
}

export function useInsightsTerm() {
  return useQuery({
    queryKey: ['insights', 'term'],
    queryFn: async (): Promise<InsightsTerm> => {
      const { data, error } = await supabase
        .from('insights_term')
        .select('*')
        .single()
      if (error) throw error
      return toTerm(data)
    },
  })
}

export type InsightsSaleDay = {
  saleDayId: string
  saleDate: string
  salesCents: number
  countedCents: number
  overShortCents: number
  itemsOut: number
  volunteers: string
  note: string | null
}

export function useInsightsSaleDays() {
  return useQuery({
    queryKey: ['insights', 'sale-days'],
    queryFn: async (): Promise<InsightsSaleDay[]> => {
      const { data, error } = await supabase
        .from('insights_sale_days')
        .select('*')
        .order('sale_date', { ascending: false })
      if (error) throw error
      return data.map((row) => ({
        saleDayId: row.sale_day_id!,
        saleDate: row.sale_date!,
        salesCents: row.sales_cents ?? 0,
        countedCents: row.counted_cents ?? 0,
        overShortCents: row.over_short_cents ?? 0,
        itemsOut: row.items_out ?? 0,
        volunteers: row.volunteers ?? '',
        note: row.note,
      }))
    },
  })
}

export type InsightsItem = {
  itemId: string
  name: string
  daysOut: number
  piecesPerDayOut: number
  salesCents: number
}

export function useInsightsItems() {
  return useQuery({
    queryKey: ['insights', 'items'],
    queryFn: async (): Promise<InsightsItem[]> => {
      const { data, error } = await supabase
        .from('insights_items')
        .select('*')
        .order('pieces_per_day_out', { ascending: false })
      if (error) throw error
      return data.map((row) => ({
        itemId: row.item_id!,
        name: row.name!,
        daysOut: row.days_out ?? 0,
        piecesPerDayOut: row.pieces_per_day_out ?? 0,
        salesCents: row.sales_cents ?? 0,
      }))
    },
  })
}
