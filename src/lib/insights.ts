/**
 * Insights (HANDOFF §4.5): read-only, term to date. Revenue comes from the
 * cash counts in `sale_day_cash` (ADR-0015); this file only reads it. The
 * rest of Insights is rebuilt in #75.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toSaleDay, type SaleDay } from '@/lib/sale-day'

/** Closed sale days, newest first. */
export function useClosedSaleDays() {
  return useQuery({
    queryKey: ['insights', 'sale-days'],
    queryFn: async (): Promise<SaleDay[]> => {
      const { data, error } = await supabase
        .from('sale_day_cash')
        .select('*')
        .eq('phase', 'closed')
        .order('sale_date', { ascending: false })
      if (error) throw error
      return data.map(toSaleDay)
    },
  })
}
