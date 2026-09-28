/**
 * Realtime and Presence for the Sale day screen only (ADR-0010). A change to
 * any sale day row refetches what is on screen; Presence says who is counting
 * what. Other tabs refetch on focus.
 */
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { Activity, Peer } from '@/lib/presence'

const TABLES = [
  'sale_days',
  'sale_day_items',
  'cash_counts',
  'sale_day_signoffs',
] as const

/** Every query that reads sale day rows. */
const LIVE_KEYS = [
  ['sale-day'],
  ['sale-day-lineup'],
  ['lineup-options'],
  ['items'],
  ['open-sale-day'],
  ['recent-closed'],
  ['check-differences'],
  ['sale-day-totals'],
  ['sale-day-results'],
  ['cash-counts'],
  ['signoffs'],
  ['sale-day-notes'],
]

type PresenceMeta = { userId: string; name: string; activity: Activity | null }

/** Returns the other volunteers on the sale day; reports this one's activity. */
export function useSaleDayLive(activity: Activity | null): Peer[] {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [peers, setPeers] = useState<Peer[]>([])
  const channel = useRef<RealtimeChannel | null>(null)
  const latest = useRef(activity)
  useEffect(() => {
    latest.current = activity
  }, [activity])
  const userId = profile?.id
  const name = profile?.display_name ?? 'A volunteer'

  useEffect(() => {
    if (!userId) return
    const live = supabase.channel('sale-day', {
      config: { presence: { key: userId } },
    })
    channel.current = live

    const refresh = () => {
      for (const queryKey of LIVE_KEYS) {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
    for (const table of TABLES) {
      live.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        refresh,
      )
    }

    live.on('presence', { event: 'sync' }, () => {
      const state = live.presenceState<PresenceMeta>()
      setPeers(
        Object.values(state)
          .flatMap((metas) => metas.slice(-1))
          .filter((meta) => meta.userId !== userId)
          .map(({ userId: id, name: who, activity: doing }) => ({
            userId: id,
            name: who,
            activity: doing,
          })),
      )
    })

    live.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      void live.track({ userId, name, activity: latest.current })
      // Anything missed while offline or before the socket opened.
      refresh()
    })

    return () => {
      channel.current = null
      void supabase.removeChannel(live)
    }
  }, [userId, name, queryClient])

  useEffect(() => {
    if (!userId) return
    void channel.current?.track({ userId, name, activity })
  }, [activity, userId, name])

  return peers
}
