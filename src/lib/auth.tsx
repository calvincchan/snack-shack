import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/database.types'

export type Profile = Tables<'profiles'>

/**
 * Who is using the app right now.
 *
 * - `loading`: we don't know yet; the session is read from storage on start.
 * - `signed-out`: no magic link has been followed on this phone.
 * - `no-profile`: signed in, but the coordinator has not added them (or has
 *   deactivated them). They see one screen and nothing else.
 * - `ready`: an active volunteer.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'no-profile'; email: string | null }
  | { status: 'ready'; profile: Profile }

type Auth = {
  state: AuthState
  /** The signed-in profile, or null when there isn't one yet. */
  profile: Profile | null
  isCoordinator: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)

  useEffect(() => {
    let live = true

    supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      setSession(data.session)
      setSessionLoaded(true)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSessionLoaded(true)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    })

    return () => {
      live = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  const userId = session?.user.id ?? null

  // Row level security only lets active members read profiles, so a volunteer
  // who was never added (or was deactivated) simply gets no row back.
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: userId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    queryClient.clear()
  }, [queryClient])

  const value = useMemo<Auth>(() => {
    let state: AuthState
    if (!sessionLoaded) {
      state = { status: 'loading' }
    } else if (!session) {
      state = { status: 'signed-out' }
    } else if (profileQuery.isPending) {
      state = { status: 'loading' }
    } else if (profileQuery.data && profileQuery.data.active) {
      state = { status: 'ready', profile: profileQuery.data }
    } else {
      state = { status: 'no-profile', email: session.user.email ?? null }
    }

    return {
      state,
      profile: state.status === 'ready' ? state.profile : null,
      isCoordinator: state.status === 'ready' && state.profile.role === 'admin',
      signOut,
    }
  }, [
    sessionLoaded,
    session,
    profileQuery.isPending,
    profileQuery.data,
    signOut,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
