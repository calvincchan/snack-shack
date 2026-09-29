/**
 * Offline-safe count up (ADR-0010). Count writes go through TanStack Query
 * mutations that pause while the phone has no Wi-Fi, are saved to this phone's
 * storage, and resume in order when the phone is back online, even after a
 * reload.
 *
 * Each write sets one row to an absolute value (one row per sale day × item or
 * coin), so sending it twice cannot double anything: a retry is harmless.
 * Sign-off and Finish are not queued. They change the sale day's phase, so
 * they need the database's answer and show its message.
 */
import {
  MutationCache,
  QueryClient,
  useMutationState,
  type Mutation,
} from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { supabase } from '@/lib/supabase'
import {
  saleDayQueryKey,
  lineupQueryKey,
  optionsQueryKey,
  recentClosedQueryKey,
} from '@/lib/sale-day'
import { itemsQueryKey } from '@/lib/items'

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

async function send(write: CountWrite): Promise<void> {
  const { error } = await run(write)
  if (error) throw error
}

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

/** A dropped connection is worth retrying; a database refusal is not. */
export function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : ''
  return /failed to fetch|load failed|network/i.test(message)
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

export function isCountMutation(mutation: Pick<Mutation, 'options'>): boolean {
  return mutation.options.mutationKey?.[0] === COUNT_KEY[0]
}

/** Only unsent count writes are kept on the phone, never query data. */
export const countDehydrateOptions = {
  shouldDehydrateQuery: () => false,
  shouldDehydrateMutation: (mutation: Mutation) =>
    isCountMutation(mutation) && mutation.state.status === 'pending',
}

export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({ mutationCache: new MutationCache() })
  // Defaults, not hook options, so a write restored after a reload still knows
  // how to send itself.
  client.setMutationDefaults(COUNT_KEY, {
    mutationFn: send,
    // A count is never dropped for a dead connection: keep trying.
    retry: (_failures, error) => isNetworkError(error),
    onSettled: () => invalidateCountReads(client),
  })
  return client
}

/**
 * After a reload, send every restored write. A write that was mid-flight when
 * the page closed is saved as unpaused, which `resumePausedMutations` skips.
 * Sending one twice is harmless (absolute values).
 */
export function resumeCountWrites(client: QueryClient) {
  for (const mutation of client.getMutationCache().getAll()) {
    if (isCountMutation(mutation) && mutation.state.status === 'pending') {
      void mutation.continue().catch(() => {})
    }
  }
}

/** Keeps queued writes on this phone. Queries are not kept, only writes. */
export const countPersister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: 'snack-shack-count-queue',
})

export type CountSyncStatus = 'saved' | 'waiting'

/** "Waiting" while any count write is unsent, paused or being retried. */
export function countSyncStatus(
  mutations: Pick<Mutation, 'options' | 'state'>[],
): CountSyncStatus {
  const queued = mutations.some((m) => isCountMutation(m) && isUnsent(m.state))
  return queued ? 'waiting' : 'saved'
}

function isUnsent(state: Mutation['state']): boolean {
  return (
    state.status === 'pending' && (state.isPaused || state.failureCount > 0)
  )
}

export function useCountSyncStatus(): CountSyncStatus {
  const unsent = useMutationState({
    filters: { mutationKey: COUNT_KEY, status: 'pending' },
    select: (m) => isUnsent(m.state),
  })
  return unsent.some(Boolean) ? 'waiting' : 'saved'
}
