import { describe, expect, it } from 'vitest'
import { numbersSay, type RuleFacts } from '@/lib/insights-rules'

const none: RuleFacts = {
  fading: [],
  soldOut: [],
  slowest: null,
  treatShare: null,
  losses: null,
}

describe('numbersSay', () => {
  it('says nothing when no rule applies', () => {
    expect(numbersSay(none)).toEqual([])
  })

  it('words a fading item with its first and last day out', () => {
    const [line] = numbersSay({
      ...none,
      fading: [
        {
          name: 'Fruit popsicle',
          firstDate: '2026-09-10',
          firstPieces: 27,
          lastDate: '2026-09-22',
          lastPieces: 22,
        },
      ],
    })
    expect(line.lead).toBe('Fruit popsicle sales are fading.')
    expect(line.rest).toBe(
      '27 sold on Sep 10, 22 on Sep 22. Leave it out of the lineup on cold days.',
    )
  })

  it('words a sold out item as days out of days', () => {
    const [line] = numbersSay({
      ...none,
      soldOut: [{ name: 'Fruit gummies', soldOutDays: 3, daysOut: 5 }],
    })
    expect(line.lead).toBe('Fruit gummies sold out 3 of the 5 days it was out.')
    expect(line.rest).toBe('Bring more of it, or buy more next trip.')
  })

  it('words a single day out plainly', () => {
    const [line] = numbersSay({
      ...none,
      soldOut: [{ name: 'Fruit gummies', soldOutDays: 1, daysOut: 1 }],
    })
    expect(line.lead).toBe('Fruit gummies sold out on its only day out.')
  })

  it('words the slowest mover, treat share and check stock losses', () => {
    const lines = numbersSay({
      ...none,
      slowest: { name: 'Seaweed snack', piecesPerDayOut: 8, daysOut: 2 },
      treatShare: { treatPct: 44 },
      losses: { pieces: 4, costCents: 94 },
    })
    expect(lines.map((l) => l.lead)).toEqual([
      'Seaweed snack is the slowest mover, about 8 sold per sale day it is out.',
      '44% of items sold are treats.',
      '4 items were missing or damaged before sales ($0.94 at cost).',
    ])
    expect(lines[2].rest).toBe(
      "Found during Check stock, so they didn't throw off the cash.",
    )
  })

  it('uses the singular for one lost item', () => {
    const [line] = numbersSay({
      ...none,
      losses: { pieces: 1, costCents: 95 },
    })
    expect(line.lead).toBe(
      '1 item was missing or damaged before sales ($0.95 at cost).',
    )
  })

  it('lists the rules in the handoff order', () => {
    const lines = numbersSay({
      fading: [
        {
          name: 'A',
          firstDate: '2026-09-10',
          firstPieces: 10,
          lastDate: '2026-09-15',
          lastPieces: 5,
        },
      ],
      soldOut: [{ name: 'B', soldOutDays: 1, daysOut: 2 }],
      slowest: { name: 'C', piecesPerDayOut: 3, daysOut: 2 },
      treatShare: { treatPct: 50 },
      losses: { pieces: 2, costCents: 100 },
    })
    expect(lines.map((l) => l.key)).toEqual([
      'fading:A',
      'sold-out:B',
      'slowest',
      'treat-share',
      'losses',
    ])
  })
})
