import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Volunteers sign in once and stay signed in all term: keep the session in
    // this phone's storage and refresh it in the background.
    persistSession: true,
    autoRefreshToken: true,
    // The magic link lands back on the app with the session in the URL.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
