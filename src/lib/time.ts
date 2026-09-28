const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "a minute ago", "3 hours ago" — plain enough for a conflict prompt at a busy
 * table. Anything older than a week is given as a date.
 */
export function timeAgo(when: string | Date, now: Date = new Date()): string {
  const then = typeof when === 'string' ? new Date(when) : when
  const elapsed = now.getTime() - then.getTime()

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < 2 * MINUTE) return 'a minute ago'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} minutes ago`
  if (elapsed < 2 * HOUR) return 'an hour ago'
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hours ago`
  if (elapsed < 2 * DAY) return 'yesterday'
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`

  return `on ${then.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
}
