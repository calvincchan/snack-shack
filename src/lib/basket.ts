/**
 * The Sell helper's basket (HANDOFF §4.2). Nothing here is saved: it is a
 * calculator for the line, so it lives on the client.
 */
import type { ItemType } from '@/lib/sale-day'

export type KidRules = { maxItems: number; maxTreats: number }

export type BasketItem = {
  itemId: string
  name: string
  type: ItemType
  priceCents: number
  bundleSize: number
}

/** A deal ("2 for $1") is one item at one price. */
export function basketTotalCents(basket: BasketItem[]): number {
  return basket.reduce((sum, item) => sum + item.priceCents, 0)
}

export function treatCount(basket: BasketItem[]): number {
  return basket.filter((item) => item.type === 'treat').length
}

export function canAdd(
  basket: BasketItem[],
  item: BasketItem,
  rules: KidRules,
): boolean {
  if (basket.length >= rules.maxItems) return false
  return item.type !== 'treat' || treatCount(basket) < rules.maxTreats
}

export function addToBasket(
  basket: BasketItem[],
  item: BasketItem,
  rules: KidRules,
): BasketItem[] {
  return canAdd(basket, item, rules) ? [...basket, item] : basket
}

export function removeFromBasket(
  basket: BasketItem[],
  index: number,
): BasketItem[] {
  return basket.filter((_, position) => position !== index)
}

/** Change to give back; null when the payment does not cover the total. */
export function changeCents(paidCents: number, totalCents: number) {
  return paidCents >= totalCents ? paidCents - totalCents : null
}
