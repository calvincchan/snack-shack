import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Lineup } from '@/app/sale-day/lineup'
import { CheckStock } from '@/app/sale-day/check-stock'
import { Selling } from '@/app/sale-day/selling'
import {
  STEPS,
  stepIndex,
  useCreateSaleDay,
  useSaleDay,
  type SaleDay,
} from '@/lib/sale-day'
import { formatCents } from '@/lib/money'
import { formatSaleDate } from '@/lib/time'

const TITLES = {
  lineup: "Pick today's lineup",
  check: 'Check the boxes',
  selling: 'Sale in progress',
  counting: 'After-lunch count-up',
} as const

export function SaleDayPage() {
  // Check stock is part of the lineup phase in the database (nothing is
  // written until Start sale), so which of the two is on screen lives here.
  const [checking, setChecking] = useState(false)
  const saleDay = useSaleDay()

  if (saleDay.isPending) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>
  }

  if (!saleDay.data) return <NoSaleDay />

  const day = saleDay.data
  const onLineup = day.phase === 'lineup'
  const title = onLineup
    ? checking
      ? TITLES.check
      : TITLES.lineup
    : day.phase === 'selling'
      ? TITLES.selling
      : TITLES.counting

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h1 className="sr-only">Sale day</h1>
      <Header day={day} title={title} step={stepIndex(day.phase, checking)} />

      {onLineup &&
        (checking ? (
          <CheckStock saleDay={day} onBack={() => setChecking(false)} />
        ) : (
          <Lineup saleDay={day} onCheckStock={() => setChecking(true)} />
        ))}

      {day.phase === 'selling' && <Selling saleDay={day} />}

      {day.phase === 'counting' && (
        <p className="text-muted-foreground text-sm">
          The count up is open. Counting what&apos;s left, the cash and the
          two-person sign-off come next.
        </p>
      )}
    </div>
  )
}

function Header({
  day,
  title,
  step,
}: {
  day: SaleDay
  title: string
  step: number
}) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Sale day {day.dayNo} · {formatSaleDate(day.saleDate)}
        </p>
        <h2 className="font-heading text-2xl font-semibold">{title}</h2>
      </div>

      <p className="text-muted-foreground text-sm">
        Change float {formatCents(day.floatCents)}
      </p>

      <ol className="grid grid-cols-4 gap-2" aria-label="Sale day steps">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-col gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                'h-1 rounded-full',
                index < step && 'bg-ok',
                index === step && 'bg-primary',
                index > step && 'bg-muted',
              )}
            />
            <span
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'text-sm',
                index === step
                  ? 'font-semibold'
                  : 'text-muted-foreground font-medium',
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function NoSaleDay() {
  const create = useCreateSaleDay()

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-heading text-xl font-semibold">Sale day</h1>
      <p className="text-muted-foreground text-sm">
        Nothing is running. Start one when you are setting up the table; the app
        suggests a lineup to begin with.
      </p>
      <Button
        type="button"
        className="text-primary-foreground min-h-12"
        disabled={create.isPending}
        onClick={() =>
          create.mutate(undefined, {
            onError: (error) => toast.error(error.message),
          })
        }
      >
        Start a sale day
      </Button>
    </div>
  )
}
