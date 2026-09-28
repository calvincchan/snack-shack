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

/**
 * "Tue, Sep 29" from a database date.
 *
 * A date column has no time zone, so it is read piece by piece. Handing
 * "2026-09-29" to `new Date` means UTC midnight, which is still the 28th on a
 * BC phone.
 */
export function formatSaleDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Today where the volunteer is standing, as the database writes dates. */
export function todayDate(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
