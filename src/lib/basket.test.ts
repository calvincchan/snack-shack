import { describe, expect, it } from 'vitest'
import {
  addToBasket,
  basketTotalCents,
  canAdd,
  changeCents,
  removeFromBasket,
  type BasketItem,
  type KidRules,
} from '@/lib/basket'

const rules: KidRules = { maxItems: 3, maxTreats: 1 }
const chips: BasketItem = {
  itemId: 'chips',
  name: 'Chips',
  type: 'snack',
  priceCents: 100,
  bundleSize: 1,
}
const bar: BasketItem = { ...chips, itemId: 'bar', name: 'Bar', type: 'treat' }
const deal: BasketItem = {
  ...chips,
  itemId: 'gum',
  name: 'Gum',
  priceCents: 100,
  bundleSize: 2,
}

describe('basket', () => {
  it('totals what the kid owes; a deal is one price', () => {
    const basket = [chips, deal, { ...chips, priceCents: 200 }]
    expect(basketTotalCents(basket)).toBe(400)
  })

  it('stops at the item limit; a deal counts as one item', () => {
    const three = [chips, deal, chips]
    expect(canAdd(three, chips, rules)).toBe(false)
    expect(canAdd([chips, deal], chips, rules)).toBe(true)
  })

  it('stops a second treat but not a second snack', () => {
    expect(canAdd([bar], bar, rules)).toBe(false)
    expect(canAdd([bar], chips, rules)).toBe(true)
  })

  it('reads the limits it is given', () => {
    expect(canAdd([bar], bar, { maxItems: 3, maxTreats: 2 })).toBe(true)
    expect(canAdd([chips], chips, { maxItems: 1, maxTreats: 1 })).toBe(false)
  })

  it('does not add past a limit', () => {
    expect(addToBasket([bar], bar, rules)).toEqual([bar])
  })

  it('removes one chip by position, so repeats stay', () => {
    expect(removeFromBasket([chips, bar, chips], 0)).toEqual([bar, chips])
  })
})

describe('changeCents', () => {
  it('is what is paid less the total', () => {
    expect(changeCents(500, 300)).toBe(200)
    expect(changeCents(100, 100)).toBe(0)
  })

  it('is null when the payment falls short', () => {
    expect(changeCents(100, 300)).toBeNull()
  })
})
