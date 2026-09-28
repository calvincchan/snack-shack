import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Enums } from '@/lib/database.types'

export type StockByType = {
  type: Enums<'item_type'>
  onHand: number
  /** Pieces of this type sold on an average sale day; null until one is closed. */
  soldPerSaleDay: number | null
  targetPieces: number
  buyPieces: number
  saleDaysLeft: number | null
}

/** Runs out next sale / About 1 sale day left / Covered for 2+ sale days. */
export function stockStatus(saleDaysLeft: number | null): string {
  if (saleDaysLeft === null) return 'No finished sale days yet'
  if (saleDaysLeft < 1) return 'Runs out next sale'
  if (saleDaysLeft < 2) return 'About 1 sale day left'
  return 'Covered for 2+ sale days'
}

export function stockTone(saleDaysLeft: number | null): 'ok' | 'warn' | 'bad' {
  if (saleDaysLeft === null) return 'warn'
  if (saleDaysLeft < 1) return 'bad'
  if (saleDaysLeft < 2) return 'warn'
  return 'ok'
}

export function useStockByType() {
  return useQuery({
    queryKey: ['stock-by-type'],
    queryFn: async (): Promise<StockByType[]> => {
      const { data, error } = await supabase
        .from('stock_by_type')
        .select('*')
        .order('type')
      if (error) throw error

      return data.map((row) => ({
        type: row.type!,
        onHand: row.on_hand ?? 0,
        soldPerSaleDay:
          row.sold_per_sale_day === null ? null : Number(row.sold_per_sale_day),
        targetPieces: row.target_pieces ?? 0,
        buyPieces: row.buy_pieces ?? 0,
        saleDaysLeft:
          row.sale_days_left === null ? null : Number(row.sale_days_left),
      }))
    },
  })
}

export type ShoppingTrip = {
  id: string
  volunteerId: string
  volunteerName: string
  plannedFor: string | null
}

/** At most one open trip, so everyone sees the same one (HANDOFF §5.10). */
export function useShoppingTrip() {
  return useQuery({
    queryKey: ['shopping-trip'],
    queryFn: async (): Promise<ShoppingTrip | null> => {
      const { data, error } = await supabase
        .from('shopping_trips')
        .select('id, volunteer_id, planned_for, profiles(display_name)')
        .is('released_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      return {
        id: data.id,
        volunteerId: data.volunteer_id,
        volunteerName: data.profiles?.display_name ?? 'Someone',
        plannedFor: data.planned_for,
      }
    },
  })
}

export function useClaimTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (plannedFor: string) => {
      const { error } = await supabase
        .from('shopping_trips')
        .insert({ planned_for: plannedFor.trim() || null })
      if (error) throw error
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['shopping-trip'] }),
  })
}

export function useCancelTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('shopping_trips')
        .update({ released_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['shopping-trip'] }),
  })
}

export type Tip = { id: string; text: string }

/** Sold-out items and the notes volunteers left at the last count ups. */
export function useTips() {
  return useQuery({
    queryKey: ['buying-tips'],
    queryFn: async (): Promise<Tip[]> => {
      const [soldOut, notes] = await Promise.all([
        supabase
          .from('item_overview')
          .select('id, name, on_hand')
          .eq('archived', false)
          .lte('on_hand', 0)
          .not('price_cents', 'is', null),
        supabase
          .from('sale_days')
          .select('id, sale_date, note')
          .eq('phase', 'closed')
          .not('note', 'is', null)
          .order('sale_date', { ascending: false })
          .limit(3),
      ])
      if (soldOut.error) throw soldOut.error
      if (notes.error) throw notes.error

      return [
        ...soldOut.data.map((item) => ({
          id: `out-${item.id}`,
          text: `${item.name} is out. Buy more on the next trip.`,
        })),
        ...notes.data.map((day) => ({
          id: `note-${day.id}`,
          text: `${day.sale_date}: ${day.note}`,
        })),
      ]
    },
  })
}
