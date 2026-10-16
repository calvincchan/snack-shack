import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { BandPill, Tag, TypeDot } from '@/components/item-bits'
import { ItemEditor } from '@/app/items/item-editor'
import { CountStock } from '@/app/items/count-stock'
import { RepackPrototype } from '@/app/items/repack-prototype'
import { useSearchParams } from 'react-router'
import { stockLine, useItems, useSaveItem, type Item } from '@/lib/items'
import { formatCents } from '@/lib/money'
import {
  formatMargin,
  marginBand,
  marginOf,
  priceLabel,
  priceOptions,
} from '@/lib/pricing'

export function ItemsPage() {
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [counting, setCounting] = useState(false)

  // PROTOTYPE (#85): ?variant= opens the Repack prototype.
  const [params, setParams] = useSearchParams()
  const repacking = params.has('variant')

  const items = useItems({ includeArchived: showArchived })

  const all = items.data ?? []
  const needPrice = all.filter(
    (item) => item.priceCents === null && !item.archived,
  )
  const priced = all.filter(
    (item) => item.priceCents !== null && !item.archived,
  )
  const archived = all.filter((item) => item.archived)

  if (counting) {
    return (
      <CountStock
        items={priced.concat(needPrice)}
        onDone={() => setCounting(false)}
      />
    )
  }

  if (repacking) {
    return (
      <RepackPrototype
        items={all}
        onDone={() => setParams({}, { replace: true })}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      <h1 className="sr-only">Items</h1>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="text-foreground min-h-12 self-start"
          onClick={() => setCounting(true)}
        >
          Count stock
        </Button>
        <Button
          variant="outline"
          className="text-foreground min-h-12 self-start"
          onClick={() => setParams({ variant: 'A' })}
        >
          Repack
        </Button>
      </div>

      {items.isPending && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}
      {items.isError && (
        <p role="alert" className="text-destructive text-sm">
          Could not load the items. Check your connection and try again.
        </p>
      )}

      {needPrice.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading title="Needs a price" note="Tap a price to set it" />
          {needPrice.map((item) => (
            <NeedsPriceCard key={item.id} item={item} />
          ))}
        </section>
      )}

      {priced.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading title="All items" note="Tap to edit" />
          <ul
            aria-label="All items"
            className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border"
          >
            {priced.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onOpen={() => setEditing(item.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {showArchived && archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading title="Archived" note="Hidden from the list" />
          <ul
            aria-label="Archived items"
            className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border opacity-70"
          >
            {archived.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onOpen={() => setEditing(item.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        className="text-muted-foreground min-h-11 self-start text-sm underline underline-offset-4"
        onClick={() => setShowArchived((shown) => !shown)}
      >
        {showArchived ? 'Hide archived items' : 'Show archived items'}
      </button>

      <p className="text-muted-foreground text-sm">
        Anyone on the team can edit an item, any time. Price and type changes
        made during a sale apply from the next sale day. Every change is
        recorded, so Insights can compare how an item sold at each price.
      </p>

      <ItemEditor
        key={editing}
        item={all.find((item) => item.id === editing) ?? null}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <h2 className="flex items-baseline gap-2">
      <span className="font-heading text-lg font-semibold">{title}</span>
      {note && (
        <span className="text-muted-foreground text-sm font-normal">
          {note}
        </span>
      )}
    </h2>
  )
}

function ItemName({ item }: { item: Item }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{item.name}</span>
      {item.isNew && <Tag>New</Tag>}
      {item.storage === 'freezer' && <Tag>❄ Freezer</Tag>}
    </span>
  )
}

function ItemRow({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const margin = marginOf(
    item.costPerPieceCents,
    item.priceCents!,
    item.bundleSize,
  )

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="text-foreground hover:bg-accent flex w-full items-center gap-3 p-3 text-left"
      >
        <TypeDot type={item.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ItemName item={item} />
          <p className="text-muted-foreground text-sm tabular-nums">
            {stockLine(item)} · {formatCents(item.costPerPieceCents)} a piece ·{' '}
            {formatMargin(margin)}
          </p>
          <span className="flex flex-wrap items-center gap-2">
            <BandPill band={marginBand(margin)} />
          </span>
        </div>
        <span className="font-heading text-foreground shrink-0 text-lg font-semibold tabular-nums">
          {priceLabel(item.priceCents, item.bundleSize)}
        </span>
      </button>
    </li>
  )
}

function NeedsPriceCard({ item }: { item: Item }) {
  const save = useSaveItem()

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-start gap-3">
        <TypeDot type={item.type} className="mt-1.5" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <ItemName item={item} />
          <p className="text-muted-foreground text-sm tabular-nums">
            Bought {item.boughtSince} · {formatCents(item.costPerPieceCents)} a
            piece
            {item.lastBoughtBy && ` · logged by ${item.lastBoughtBy}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {priceOptions(item.costPerPieceCents).map((option) => (
          <button
            key={`${option.priceCents}-${option.bundleSize}`}
            type="button"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: item.id,
                  version: item.version,
                  edit: {
                    name: item.name,
                    type: item.type,
                    storage: item.storage,
                    priceCents: option.priceCents,
                    bundleSize: option.bundleSize,
                  },
                },
                {
                  onSuccess: () =>
                    toast.success(
                      `${item.name} is ${priceLabel(option.priceCents, option.bundleSize)}.`,
                    ),
                  onError: (error) => toast.error(error.message),
                },
              )
            }
            className={cn(
              'border-border text-foreground bg-card flex min-h-16 flex-col items-start gap-1 rounded-lg border p-3 text-left',
              'hover:bg-accent disabled:opacity-60',
              option.suggested && 'border-primary',
            )}
          >
            <span className="flex w-full items-baseline justify-between gap-2">
              <span className="font-heading text-lg font-semibold">
                {priceLabel(option.priceCents, option.bundleSize)}
              </span>
              {option.suggested && (
                <span className="text-ok text-xs font-semibold tracking-wide uppercase">
                  Suggested
                </span>
              )}
            </span>
            <span className="text-muted-foreground text-sm">
              {option.band.label} · {formatMargin(option.margin)} margin
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
