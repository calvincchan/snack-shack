import { describe, expect, it } from 'vitest'
import { formatSaleDate, timeAgo, todayDate } from '@/lib/time'

const now = new Date('2026-09-28T12:00:00Z')
const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now)

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('timeAgo', () => {
  it('reads the way a volunteer would say it', () => {
    expect(ago(5 * SECOND)).toBe('just now')
    expect(ago(90 * SECOND)).toBe('a minute ago')
    expect(ago(9 * MINUTE)).toBe('9 minutes ago')
    expect(ago(90 * MINUTE)).toBe('an hour ago')
    expect(ago(5 * HOUR)).toBe('5 hours ago')
    expect(ago(30 * HOUR)).toBe('yesterday')
    expect(ago(4 * DAY)).toBe('4 days ago')
  })

  it('gives a date once it is more than a week old', () => {
    expect(ago(20 * DAY)).toMatch(/^on /)
  })

  it('takes a timestamp string straight from the database', () => {
    expect(timeAgo('2026-09-28T11:50:00Z', now)).toBe('10 minutes ago')
  })
})

describe('formatSaleDate', () => {
  it('reads like the header on the sale day screen', () => {
    expect(formatSaleDate('2026-09-29')).toBe('Tue, Sep 29')
  })

  it('keeps the day the volunteer is standing in, not UTC midnight', () => {
    expect(formatSaleDate('2026-01-01')).toBe('Thu, Jan 1')
  })
})

describe('todayDate', () => {
  it('writes the local date the way the database stores it', () => {
    expect(todayDate(new Date(2026, 8, 29, 23, 30))).toBe('2026-09-29')
  })
})
