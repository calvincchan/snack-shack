/**
 * Realtime for the Sale day screen only (ADR-0010; Presence dropped in
 * ADR-0015). A change to any sale day row refetches what is on screen, so two
 * phones counting the same box see each other's numbers. Other tabs refetch
 * on focus.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { invalidateSaleDay } from '@/lib/sale-day'

const TABLES = ['sale_days', 'cash_counts'] as const

export function useSaleDayLive() {
  const queryClient = useQueryClient()
  const userId = useAuth().profile?.id

  useEffect(() => {
    if (!userId) return
    const live = supabase.channel('sale-day')
    const refresh = () => invalidateSaleDay(queryClient)
    for (const table of TABLES) {
      live.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        refresh,
      )
    }
    live.subscribe((status) => {
      // Anything missed while offline or before the socket opened.
      if (status === 'SUBSCRIBED') refresh()
    })
    return () => {
      void supabase.removeChannel(live)
    }
  }, [userId, queryClient])
}
