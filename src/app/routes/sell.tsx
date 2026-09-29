import { useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Tag, TypeDot } from '@/components/item-bits'
import {
  addToBasket,
  basketTotalCents,
  canAdd,
  changeCents,
  removeFromBasket,
  treatCount,
  type BasketItem,
} from '@/lib/basket'
import { formatCents } from '@/lib/money'
import { priceLabel } from '@/lib/pricing'
import { useKidRules, useLineup, useSaleDay } from '@/lib/sale-day'

const PAID_WITH = [100, 200, 500, 1000, 2000] as const

/** A calculator for the line. Nothing here is saved (HANDOFF §4.2). */
export function SellPage() {
  const saleDay = useSaleDay()
  const lineup = useLineup(saleDay.data?.id)
  const rules = useKidRules()
  const [basket, setBasket] = useState<BasketItem[]>([])
  const [paid, setPaid] = useState<number | null>(null)

  if (saleDay.isPending) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>
  }

  const selling = saleDay.data?.phase === 'selling'
  if (!selling || !rules.data) {
    return (
      <div className="p-4">
        <h1 className="font-heading text-xl font-semibold">Sell</h1>
        <p className="text-muted-foreground mt-2">
          No lineup on the table yet.
        </p>
      </div>
    )
  }

  const limits = rules.data
  const total = basketTotalCents(basket)
  const change = paid === null ? null : changeCents(paid, total)

  const nextKid = () => {
    setBasket([])
    setPaid(null)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-heading text-xl font-semibold">Sell</h1>

      <ul aria-label="Tiles" className="grid grid-cols-2 gap-3">
        {(lineup.data ?? []).map((item) => (
          <li key={item.itemId}>
            <button
              type="button"
              disabled={!canAdd(basket, item, limits)}
              onClick={() => {
                setBasket(addToBasket(basket, item, limits))
                setPaid(null)
              }}
              className="border-border bg-card text-card-foreground flex min-h-24 w-full flex-col items-start gap-1 rounded-xl border p-3 text-left disabled:opacity-40"
            >
              <span className="flex items-center gap-2 font-medium">
                <TypeDot type={item.type} />
                {item.name}
              </span>
              <b className="font-heading tabular-nums">
                {priceLabel(item.priceCents, item.bundleSize)}
              </b>
              <span className="flex flex-wrap gap-1">
                <Tag>{item.type === 'treat' ? 'Treat' : 'Snack'}</Tag>
                {item.storage === 'freezer' && <Tag>❄ Freezer</Tag>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <section
        aria-label="Basket"
        className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">Total</span>
          <b className="font-heading text-2xl tabular-nums">
            {formatCents(total)}
          </b>
        </div>
        <p className="text-muted-foreground text-sm tabular-nums">
          {basket.length} of {limits.maxItems} items · {treatCount(basket)} of{' '}
          {limits.maxTreats} treat
          {limits.maxTreats === 1 ? '' : 's'}
        </p>

        {basket.length > 0 && (
          <ul aria-label="In the basket" className="flex flex-wrap gap-2">
            {basket.map((item, index) => (
              <li key={`${item.itemId}-${index}`}>
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => {
                    setBasket(removeFromBasket(basket, index))
                    setPaid(null)
                  }}
                  className="bg-muted text-foreground min-h-11 rounded-full px-3 text-sm"
                >
                  {item.name} ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div role="group" aria-label="Paid with" className="flex gap-2">
          {PAID_WITH.map((cents) => (
            <Button
              key={cents}
              type="button"
              variant="outline"
              aria-pressed={paid === cents}
              disabled={basket.length === 0}
              onClick={() => setPaid(cents)}
              className={cn(
                'text-foreground min-h-12 flex-1 px-0',
                paid === cents && 'border-primary',
              )}
            >
              ${cents / 100}
            </Button>
          ))}
        </div>

        {paid !== null && (
          <p role="status" className="text-lg font-semibold tabular-nums">
            {change === null
              ? `Short ${formatCents(total - paid)}`
              : `Change ${formatCents(change)}`}
          </p>
        )}

        <Button
          type="button"
          className="text-primary-foreground min-h-12 w-full"
          onClick={nextKid}
        >
          Next kid
        </Button>
      </section>
    </div>
  )
}
