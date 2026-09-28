import { useState } from 'react'
import { toast } from 'sonner'
import { ShoppingBag } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { TypeDot } from '@/components/item-bits'
import { useAuth } from '@/lib/auth'
import {
  stockStatus,
  stockTone,
  useCancelTrip,
  useClaimTrip,
  useShoppingTrip,
  useStockByType,
  useTips,
  type StockByType,
} from '@/lib/what-to-buy'

export function WhatToBuy() {
  return (
    <div className="flex flex-col gap-4">
      <ShoppingTripCard />
      <StockGauges />
      <Tips />
    </div>
  )
}

function ShoppingTripCard() {
  const { profile } = useAuth()
  const trip = useShoppingTrip()
  const claim = useClaimTrip()
  const cancel = useCancelTrip()
  const [plannedFor, setPlannedFor] = useState('')

  if (trip.data) {
    const mine = trip.data.volunteerId === profile?.id
    return (
      <section className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3">
        <p className="flex items-center gap-2">
          <ShoppingBag className="text-primary size-5" aria-hidden="true" />
          <span>
            <span className="font-medium">
              {mine ? 'You are' : `${trip.data.volunteerName} is`}
            </span>{' '}
            going shopping
            {trip.data.plannedFor ? `, ${trip.data.plannedFor}` : ''}.
          </span>
        </p>
        {mine && (
          <Button
            type="button"
            variant="outline"
            className="text-foreground min-h-12"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(trip.data!.id, {
                onSuccess: () => toast.success('Trip cancelled.'),
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Cancel the trip
          </Button>
        )}
      </section>
    )
  }

  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="planned-for">When are you going?</Label>
        <Input
          id="planned-for"
          className="min-h-12"
          placeholder="Thursday"
          value={plannedFor}
          onChange={(event) => setPlannedFor(event.target.value)}
        />
      </div>
      <Button
        type="button"
        className="text-primary-foreground min-h-12"
        disabled={claim.isPending}
        onClick={() =>
          claim.mutate(plannedFor, {
            onSuccess: () => {
              setPlannedFor('')
              toast.success("You're down for the next shopping trip.")
            },
            onError: (error) => toast.error(error.message),
          })
        }
      >
        I&apos;m going shopping
      </Button>
      <p className="text-muted-foreground text-sm">
        So two people don&apos;t buy the same things.
      </p>
    </section>
  )
}

const toneClass = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
} as const

function StockGauges() {
  const stock = useStockByType()

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">Stock by type</h2>
      {(stock.data ?? []).map((row) => (
        <Gauge key={row.type} row={row} />
      ))}
    </section>
  )
}

function Gauge({ row }: { row: StockByType }) {
  const label = row.type === 'treat' ? 'Treats' : 'Snacks'
  const filled =
    row.targetPieces > 0
      ? Math.min(100, Math.round((row.onHand / row.targetPieces) * 100))
      : 100

  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3">
      <p className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <TypeDot type={row.type} />
          {label}
        </span>
        <span className={cn('text-sm', toneClass[stockTone(row.saleDaysLeft)])}>
          {stockStatus(row.saleDaysLeft)}
        </span>
      </p>

      <Progress value={filled} aria-label={`${label} against target stock`} />

      <p className="text-muted-foreground text-sm tabular-nums">
        {row.onHand} pieces on hand
        {row.soldPerSaleDay !== null &&
          ` · ${row.soldPerSaleDay.toFixed(0)} sold a sale day`}
        {row.targetPieces > 0 && ` · target ${row.targetPieces}`}
      </p>

      <p className="text-sm tabular-nums">
        {row.buyPieces > 0
          ? `Buy about ${row.buyPieces} pieces.`
          : 'Nothing needed right now.'}
      </p>
    </div>
  )
}

function Tips() {
  const tips = useTips()

  if (!tips.data || tips.data.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-lg font-semibold">
        Tips from recent sales
      </h2>
      <ul aria-label="Tips from recent sales" className="flex flex-col gap-2">
        {tips.data.map((tip) => (
          <li
            key={tip.id}
            className="border-border bg-card rounded-xl border p-3 text-sm"
          >
            {tip.text}
          </li>
        ))}
      </ul>
    </section>
  )
}
