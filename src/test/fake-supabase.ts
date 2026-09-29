import { vi } from 'vitest'
import type { Tables } from '@/lib/database.types'

type Profile = Tables<'profiles'>

type FakeState = {
  /** null = signed out. */
  user: { id: string; email: string } | null
  /** null = signed in but not on the team. */
  profile: Profile | null
}

export const fakeState: FakeState = { user: null, profile: null }

export function signedOut() {
  fakeState.user = null
  fakeState.profile = null
}

export function signedInWithoutProfile(email = 'stranger@example.com') {
  fakeState.user = { id: 'user-1', email }
  fakeState.profile = null
}

export function signedInAs(profile: Partial<Profile> = {}) {
  const full: Profile = {
    id: 'user-1',
    display_name: 'Yuki',
    email: 'yuki@example.com',
    role: 'volunteer',
    active: true,
    created_at: '2026-09-01T00:00:00Z',
    ...profile,
  }
  fakeState.user = { id: full.id, email: full.email ?? '' }
  fakeState.profile = full
}

export const signInWithOtp = vi.fn(async () => ({ data: {}, error: null }))
export const signOut = vi.fn(async () => {
  signedOut()
  return { error: null }
})

/** Only the calls the app actually makes. Extend as screens are built. */
export const supabase = {
  auth: {
    getSession: async () => ({
      data: { session: fakeState.user ? { user: fakeState.user } : null },
      error: null,
    }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    signInWithOtp,
    signOut,
  },
  from: (table: string) => ({
    select: () => {
      const result = {
        eq: () => result,
        is: () => result,
        order: () => result,
        maybeSingle: async () => ({
          data: table === 'profiles' ? fakeState.profile : null,
          error: null,
        }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: [], error: null }),
      }
      return result
    },
  }),
  channel: () => {
    const channel = {
      on: () => channel,
      subscribe: () => channel,
      track: async () => 'ok',
      presenceState: () => ({}),
    }
    return channel
  },
  removeChannel: async () => 'ok',
  rpc: vi.fn(async () => ({ data: null, error: null })),
}
