import { z } from 'zod'
import type { Enums } from '@/lib/database.types'

export type Role = Enums<'user_role'>

export const roleLabels: Record<Role, string> = {
  volunteer: 'Volunteer',
  admin: 'Coordinator',
  treasurer: 'Treasurer',
}

/** Mirror the database rules so mistakes show before saving (ADR-0014). */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(30, 'Keep the name to 30 characters or fewer.')

export const fullNameSchema = z
  .string()
  .trim()
  .max(100, 'Keep the full name to 100 characters or fewer.')
