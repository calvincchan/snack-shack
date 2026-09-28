import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BandPill } from '@/components/item-bits'
import { supabase } from '@/lib/supabase'
import { dealCheck } from '@/lib/deal-check'
import { dollarStringToCents, formatCents } from '@/lib/money'
import { formatMargin, priceLabel } from '@/lib/pricing'
import type { Enums } from '@/lib/database.types'

export type BoughtIt = {
  type: Enums<'item_type'>
  pieces: number
  costCents: number
  priceCents: number
  bundleSize: number
}

function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .single()
      if (error) throw error
      return data
    },
  })
}

function useTypeBenchmarks() {
  return useQuery({
    queryKey: ['type-benchmarks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('type_benchmarks').select('*')
      if (error) throw error
      return data
    },
  })
}

export function DealCheck({
  onBoughtIt,
}: {
  onBoughtIt: (bought: BoughtIt) => void
}) {
  const [shelf, setShelf] = useState('')
  const [pieces, setPieces] = useState('')
  const [type, setType] = useState<Enums<'item_type'>>('treat')
  const [addGst, setAddGst] = useState(true)

  const settings = useSettings()
  const benchmarks = useTypeBenchmarks()
  const benchmark = benchmarks.data?.find((row) => row.type === type)

  const deal = dealCheck({
    shelfCents: dollarStringToCents(shelf),
    pieces: Number(pieces),
    addGst,
    gstRate: Number(settings.data?.gst_rate ?? 0.05),
    usualCostCents:
      benchmark?.usual_cost_cents != null
        ? Number(benchmark.usual_cost_cents)
        : null,
    piecesPerDayOut:
      benchmark?.pieces_per_day_out != null
        ? Number(benchmark.pieces_per_day_out)
        : null,
  })

  const typeWord = type === 'treat' ? 'treats' : 'snacks'

  return (
    <div className="flex flex-col gap-4">
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
        <h2 className="font-heading text-lg font-semibold">Deal check</h2>
        <p className="text-muted-foreground text-sm">
          Worth buying? Put the shelf price and the pieces in the box.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shelf-price">Shelf price</Label>
            <Input
              id="shelf-price"
              type="text"
              inputMode="decimal"
              className="min-h-12 tabular-nums"
              value={shelf}
              onChange={(event) => setShelf(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-pieces">Pieces in the box</Label>
            <Input
              id="deal-pieces"
              type="number"
              inputMode="numeric"
              min={1}
              className="min-h-12 tabular-nums"
              value={pieces}
              onChange={(event) => setPieces(event.target.value)}
            />
          </div>
        </div>

        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Type"
          className="w-full"
          value={type}
          onValueChange={(value) =>
            value && setType(value as Enums<'item_type'>)
          }
        >
          <ToggleGroupItem
            value="snack"
            className="text-foreground min-h-12 flex-1"
          >
            Snack
          </ToggleGroupItem>
          <ToggleGroupItem
            value="treat"
            className="text-foreground min-h-12 flex-1"
          >
            Treat (sugary)
          </ToggleGroupItem>
        </ToggleGroup>

        <Button
          type="button"
          variant="outline"
          aria-pressed={addGst}
          className={cn(
            'text-foreground min-h-12',
            addGst && 'border-primary ring-primary ring-2',
          )}
          onClick={() => setAddGst((on) => !on)}
        >
          + {Math.round(Number(settings.data?.gst_rate ?? 0.05) * 100)}% GST
        </Button>
      </section>

      {deal && (
        <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
          <p className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-heading text-xl font-semibold">
              {priceLabel(deal.suggested.priceCents, deal.suggested.bundleSize)}
            </span>
            <BandPill band={deal.band} />
          </p>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">Box costs</dt>
            <dd className="text-right">{formatCents(deal.totalCents)}</dd>

            <dt className="text-muted-foreground">Each piece</dt>
            <dd className="text-right">
              {formatCents(deal.costPerPieceCents)}
            </dd>

            <dt className="text-muted-foreground">
              {deal.deals} ×{' '}
              {priceLabel(deal.suggested.priceCents, deal.suggested.bundleSize)}
            </dt>
            <dd className="text-right">{formatCents(deal.salesCents)}</dd>

            <dt className="text-muted-foreground">
              {deal.profitCents < 0 ? 'Loss on the box' : 'Profit on the box'}
            </dt>
            <dd
              className={cn('text-right', deal.profitCents < 0 && 'text-bad')}
            >
              {formatCents(Math.abs(deal.profitCents))}
            </dd>
          </dl>

          {deal.differenceFromUsualCents !== null && (
            <p className="text-muted-foreground text-sm">
              {deal.differenceFromUsualCents <= 0 ? 'Cheaper' : 'Pricier'} than
              our usual {typeWord} (
              {formatCents(
                deal.costPerPieceCents - deal.differenceFromUsualCents,
              )}{' '}
              each on average).
            </p>
          )}

          {deal.saleDays !== null && (
            <p
              className={cn(
                'text-sm',
                deal.tooBig ? 'text-warn' : 'text-muted-foreground',
              )}
            >
              Lasts about {deal.saleDays.toFixed(1)} sale days in the lineup.
              {deal.tooBig && ' Big box, make sure it fits.'}
            </p>
          )}

          <ul className="grid grid-cols-2 gap-2">
            {deal.options.map((option) => (
              <li
                key={`${option.priceCents}-${option.bundleSize}`}
                className={cn(
                  'border-border flex flex-col gap-1 rounded-lg border p-3',
                  option.suggested && 'border-primary',
                )}
              >
                <span className="font-heading text-lg font-semibold">
                  {priceLabel(option.priceCents, option.bundleSize)}
                </span>
                <span className="text-muted-foreground text-sm">
                  {option.band.label} · {formatMargin(option.margin)} margin
                </span>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            className="text-primary-foreground min-h-12"
            onClick={() =>
              onBoughtIt({
                type,
                pieces: Number(pieces),
                costCents: deal.totalCents,
                priceCents: deal.suggested.priceCents,
                bundleSize: deal.suggested.bundleSize,
              })
            }
          >
            Bought it
          </Button>
        </section>
      )}
    </div>
  )
}
