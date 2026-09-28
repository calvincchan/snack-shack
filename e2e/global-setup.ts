import { execFileSync } from 'node:child_process'
import { createAuthUser, clearMailbox } from './helpers/local-supabase'

export const COORDINATOR_EMAIL = 'coordinator@example.com'

/**
 * The end-to-end tests run against a local Supabase, and they share it, so the
 * run starts from a known database: empty, with one coordinator.
 *
 * The first account created on an empty database becomes the coordinator
 * (ADR-0011), so this has to happen before any test signs in.
 */
export default async function globalSetup() {
  execFileSync('supabase', ['db', 'reset', '--local'], { stdio: 'inherit' })
  await clearMailbox()
  await createAuthUser(COORDINATOR_EMAIL)
}
