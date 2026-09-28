import { execFileSync } from 'node:child_process'
import { clearMailbox } from './helpers/local-supabase'

/** The seeded team (see `supabase/seed.sql`). */
export const COORDINATOR_EMAIL = 'calvin@example.com'
export const VOLUNTEER_EMAIL = 'yuki@example.com'

/**
 * The end-to-end tests run against a local Supabase and share it, so the run
 * starts from a known database: the migrations plus the seed.
 */
export default async function globalSetup() {
  execFileSync('supabase', ['db', 'reset', '--local'], { stdio: 'inherit' })
  await clearMailbox()
}
