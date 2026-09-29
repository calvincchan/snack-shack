import { dehydrate, hydrate, onlineManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const writes: { table: string; values: unknown; match: unknown[] }[] = []
let failWith: { message: string } | null = null
let failTimes = Infinity

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      update: (values: unknown) => {
        const match: unknown[] = []
        const chain = {
          eq: (column: string, value: unknown) => {
            match.push([column, value])
            return chain
          },
          then: (resolve: (result: { error: unknown }) => void) => {
            if (failWith && failTimes-- > 0) return resolve({ error: failWith })
            writes.push({ table, values, match })
            resolve({ error: null })
          },
        }
        return chain
      },
    }),
  },
}))

import {
  countSyncStatus,
  createAppQueryClient,
  resumeCountWrites,
  type CountWrite,
} from '@/lib/count-queue'

const leftOut: CountWrite = {
  kind: 'left-out',
  saleDayId: 'day-1',
  itemId: 'item-1',
  left: 4,
  out: 1,
}

beforeEach(() => {
  writes.length = 0
  failWith = null
  failTimes = Infinity
  onlineManager.setOnline(true)
})
afterEach(() => onlineManager.setOnline(true))

describe('count write queue', () => {
  it('writes straight away when online', async () => {
    const client = createAppQueryClient()
    await client
      .getMutationCache()
      .build(client, { mutationKey: ['count', 'left-out'] })
      .execute(leftOut)
    expect(writes).toHaveLength(1)
    expect(writes[0].values).toEqual({ left_count: 4, out_count: 1 })
  })

  it('holds writes offline and sends each once when Wi-Fi returns', async () => {
    const client = createAppQueryClient()
    onlineManager.setOnline(false)
    const cache = client.getMutationCache()
    void cache
      .build(client, { mutationKey: ['count', 'left-out'] })
      .execute(leftOut)
    void cache
      .build(client, { mutationKey: ['count', 'cash'] })
      .execute({ kind: 'cash', saleDayId: 'day-1', denomCents: 2000, qty: 2 })
    await Promise.resolve()
    expect(writes).toHaveLength(0)
    expect(countSyncStatus(cache.getAll())).toBe('waiting')

    onlineManager.setOnline(true)
    await client.resumePausedMutations()
    expect(writes).toHaveLength(2)
    expect(countSyncStatus(cache.getAll())).toBe('saved')
  })

  it('survives a reload: queued writes hydrate and send once', async () => {
    const before = createAppQueryClient()
    onlineManager.setOnline(false)
    void before
      .getMutationCache()
      .build(before, { mutationKey: ['count', 'left-out'] })
      .execute(leftOut)
    await Promise.resolve()
    const saved = JSON.parse(JSON.stringify(dehydrate(before)))

    const after = createAppQueryClient()
    hydrate(after, saved)
    onlineManager.setOnline(true)
    resumeCountWrites(after)
    await vi.waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].match).toEqual([
      ['sale_day_id', 'day-1'],
      ['item_id', 'item-1'],
    ])
  })

  it('resends a write that was mid-flight when the page closed', async () => {
    const before = createAppQueryClient()
    onlineManager.setOnline(false)
    void before
      .getMutationCache()
      .build(before, { mutationKey: ['count', 'left-out'] })
      .execute(leftOut)
    await Promise.resolve()
    const saved = JSON.parse(JSON.stringify(dehydrate(before)))
    saved.mutations[0].state.isPaused = false

    const after = createAppQueryClient()
    hydrate(after, saved)
    onlineManager.setOnline(true)
    resumeCountWrites(after)
    await vi.waitFor(() => expect(writes).toHaveLength(1))
  })

  it('retries a dropped connection but not a database refusal', async () => {
    const client = createAppQueryClient()
    failWith = { message: 'TypeError: Failed to fetch' }
    failTimes = 2
    const flaky = client
      .getMutationCache()
      .build(client, { mutationKey: ['count', 'left-out'], retryDelay: 0 })
    await flaky.execute(leftOut)
    expect(writes).toHaveLength(1)

    failWith = { message: 'new row violates check constraint' }
    failTimes = Infinity
    const refused = client
      .getMutationCache()
      .build(client, { mutationKey: ['count', 'left-out'], retryDelay: 0 })
    await expect(refused.execute(leftOut)).rejects.toBeDefined()
    expect(refused.state.failureCount).toBe(1)
  })
})

describe('countSyncStatus', () => {
  it('is saved with nothing queued', () => {
    expect(countSyncStatus([])).toBe('saved')
  })
})
