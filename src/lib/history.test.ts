import { describe, expect, it } from 'vitest'
import { describeChange, formatWhen, toEntries } from '@/lib/history'

const row = (
  field: string,
  old_value: string | null,
  new_value: string | null,
  item_name: string | null = 'BBQ chips',
) => ({ field, old_value, new_value, item_name })

describe('describeChange', () => {
  it('words a count change on the sale day sheet', () => {
    expect(
      describeChange(row('left_count', '14', '12'), { withItem: true }),
    ).toBe('BBQ chips count changed 14 → 12')
  })

  it('leaves the item name off on the item sheet', () => {
    expect(describeChange(row('left_count', '14', '12'))).toBe(
      'count changed 14 → 12',
    )
  })

  it('says checked, not changed, for a first check stock number', () => {
    expect(describeChange(row('check_count', null, '28'))).toBe('checked at 28')
    expect(describeChange(row('check_count', '28', '30'))).toBe(
      'check changed 28 → 30',
    )
  })

  it('reads prices the way the table does', () => {
    expect(describeChange(row('price', '100/1', '100/2'))).toBe(
      'price changed $1 → 2 for $1',
    )
    expect(describeChange(row('price', null, '200/1'))).toBe(
      'price changed no price → $2',
    )
  })

  it('names the sale day steps', () => {
    expect(describeChange(row('phase', 'lineup', 'selling', null))).toBe(
      'Sale started',
    )
    expect(describeChange(row('phase', 'selling', 'counting', null))).toBe(
      'Count up started',
    )
    expect(describeChange(row('phase', 'counting', 'closed', null))).toBe(
      'Sale day closed',
    )
  })

  it('words renames and archiving', () => {
    expect(describeChange(row('name', 'BBQ chips', 'BBQ chips, big'))).toBe(
      'renamed “BBQ chips” → “BBQ chips, big”',
    )
    expect(describeChange(row('archived', 'false', 'true'))).toBe('archived')
    expect(describeChange(row('archived', 'true', 'false'))).toBe(
      'put back on the list',
    )
  })
})

describe('toEntries', () => {
  it('capitalizes, keys each field and names someone when the actor is gone', () => {
    const entries = toEntries([
      {
        id: 7,
        at: '2026-09-29T19:58:00Z',
        field: 'archived',
        old_value: 'false',
        new_value: 'true',
        item_name: 'BBQ chips',
        item_id: null,
        sale_day_id: null,
        actor_id: null,
        actor_name: null,
      },
    ])
    expect(entries).toEqual([
      {
        key: '7:archived',
        text: 'Archived',
        who: 'Someone',
        at: '2026-09-29T19:58:00Z',
      },
    ])
  })
})

describe('formatWhen', () => {
  it('gives just the time for today and adds the date for earlier days', () => {
    const now = new Date(2026, 8, 29, 15, 0)
    const today = new Date(2026, 8, 29, 12, 58).toISOString()
    const before = new Date(2026, 8, 27, 12, 58).toISOString()
    expect(formatWhen(today, now)).toMatch(/^12:58/)
    expect(formatWhen(before, now)).toMatch(/^Sep 27, 12:58/)
  })
})
