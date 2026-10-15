import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Stepper } from '@/components/stepper'
import { CashCount, Dock, SyncIndicator } from '@/app/sale-day/cash-count'
import { Done } from '@/app/sale-day/done'
import {
  openDiffLabel,
  useCancelSaleDay,
  useChangeFloat,
  useCloseSaleDay,
  useCountSyncStatus,
  useLastClosed,
  useOpenSaleDay,
  useRecentlyClosed,
  useSaleDay,
  useStartSelling,
  type SaleDay,
} from '@/lib/sale-day'
import { useSaleDayLive } from '@/lib/live-sale-day'
import { formatCents } from '@/lib/money'
import { formatSaleDate, todayDate } from '@/lib/time'

const STEPS = ['Open count', 'Selling', 'Close count'] as const

const DISMISSED_KEY = 'snack-shack:done-dismissed'

const showError = (error: Error) => toast.error(error.message)

/** Sale day (HANDOFF §4.1, ADR-0015): open count, selling, close count. */
export function SaleDayPage() {
  // The Done screen shows the most recently closed sale day (from the
  // database, so a reload or the other phone gets it too) until this phone
  // moves on.
  const [dismissedId, setDismissedId] = useState(() =>
    localStorage.getItem(DISMISSED_KEY),
  )
  const saleDay = useSaleDay()
  const recentlyClosed = useRecentlyClosed()
  useSaleDayLive()

  if (saleDay.isPending || recentlyClosed.isPending) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>
  }

  const closed = recentlyClosed.data
  if (!saleDay.data && closed && closed.id !== dismissedId) {
    return (
      <Done
        saleDay={closed}
        onClose={() => {
          localStorage.setItem(DISMISSED_KEY, closed.id)
          setDismissedId(closed.id)
        }}
      />
    )
  }

  if (!saleDay.data) return <NoSaleDay />

  const day = saleDay.data
  const step = day.selling ? 1 : 0

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h1 className="sr-only">Sale day</h1>
      <Header day={day} step={step} />
      {day.selling ? (
        <Selling key={day.id} day={day} />
      ) : (
        <OpenCount key={day.id} day={day} />
      )}
    </div>
  )
}

function Header({ day, step }: { day: SaleDay; step: number }) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Sale day
        </p>
        <h2 className="font-heading text-2xl font-semibold">
          {formatSaleDate(day.saleDate)}
        </h2>
      </div>
      <ol className="grid grid-cols-3 gap-2" aria-label="Sale day steps">
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
  const last = useLastClosed()
  const open = useOpenSaleDay()
  const today = todayDate()
  const [date, setDate] = useState(today)

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-heading text-xl font-semibold">Sale day</h1>

      {last.data && (
        <section className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Last sale day · {formatSaleDate(last.data.saleDate)}
          </p>
          <dl className="flex flex-col gap-1.5">
            {(
              [
                ['Revenue', last.data.revenueCents],
                ['Deposit', last.data.depositCents ?? 0],
                ['Left in box', last.data.leftInBoxCents ?? 0],
              ] as const
            ).map(([term, cents]) => (
              <div key={term} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="font-medium tabular-nums">
                  {formatCents(cents)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
        <h2 className="font-heading text-lg font-semibold">Open a sale day</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sale-date">Date</Label>
          <Input
            id="sale-date"
            type="date"
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="min-h-11"
          />
          <p className="text-muted-foreground text-sm">
            Missed one? Pick its date and enter its counts.
          </p>
        </div>
        <Button
          type="button"
          className="text-primary-foreground min-h-12"
          disabled={open.isPending || date === ''}
          onClick={() => open.mutate(date, { onError: showError })}
        >
          Count the cash box
        </Button>
      </section>
    </div>
  )
}

function OpenCount({ day }: { day: SaleDay }) {
  const start = useStartSelling()
  const cancel = useCancelSaleDay()
  const syncStatus = useCountSyncStatus()
  const [note, setNote] = useState('')
  const diff = openDiffLabel(day.openDiffCents, formatCents)
  const counted = day.openCents > 0

  return (
    <>
      {day.expectedOpenCents !== null && (
        <p className="bg-accent text-accent-foreground rounded-xl p-3 text-sm">
          Left in the box last time:{' '}
          <b className="tabular-nums">{formatCents(day.expectedOpenCents)}</b>
        </p>
      )}

      <SyncIndicator />
      <CashCount saleDayId={day.id} kind="open" />

      {counted && diff && (
        <>
          <p
            role="status"
            className="bg-warn-bg text-warn rounded-xl p-3 text-sm font-medium"
          >
            {diff}. Recount once, then add a note if it's still off.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="open-note">Note (optional)</Label>
            <textarea
              id="open-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Took $5 for change on Friday"
              className="border-input bg-card text-foreground min-h-16 rounded-lg border px-3 py-2"
            />
          </div>
        </>
      )}

      <Button
        type="button"
        variant="outline"
        className="text-foreground min-h-11"
        disabled={cancel.isPending}
        onClick={() => cancel.mutate(day.id, { onError: showError })}
      >
        Cancel this sale day
      </Button>

      <Dock
        heading="Open count"
        detail={formatCents(day.openCents)}
        action={
          <Button
            type="button"
            className="text-primary-foreground min-h-12"
            disabled={!counted || syncStatus !== 'saved' || start.isPending}
            onClick={() =>
              start.mutate({ saleDayId: day.id, note }, { onError: showError })
            }
          >
            Start selling
          </Button>
        }
      />
    </>
  )
}

function Selling({ day }: { day: SaleDay }) {
  const [counting, setCounting] = useState(day.closeCents > 0)

  if (counting) return <CloseCount day={day} />

  return (
    <>
      <section className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Open count</span>
          <span className="font-medium tabular-nums">
            {formatCents(day.openCents)}
          </span>
        </div>
        {day.openedBy && (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Counted by</span>
            <span className="font-medium">{day.openedBy}</span>
          </div>
        )}
        {day.openNote && (
          <p className="text-muted-foreground text-sm">Note: {day.openNote}</p>
        )}
      </section>
      <p className="bg-accent text-accent-foreground rounded-xl p-3 text-sm">
        Sell from whatever's out. Nothing to tap until the sale's over.
      </p>
      <Button
        type="button"
        className="text-primary-foreground min-h-12"
        onClick={() => setCounting(true)}
      >
        Sale's over: count the cash
      </Button>
    </>
  )
}

function CloseCount({ day }: { day: SaleDay }) {
  const float = useChangeFloat()
  const close = useCloseSaleDay()
  const syncStatus = useCountSyncStatus()
  const [leftDollars, setLeftDollars] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const left = (leftDollars ?? Math.round((float.data ?? 3000) / 100)) * 100
  const deposit = day.closeCents - left
  const counted = day.closeCents > 0

  return (
    <>
      <SyncIndicator />
      <CashCount saleDayId={day.id} kind="close" />

      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-col">
            <span className="font-medium">Left in box</span>
            <span className="text-muted-foreground text-sm">
              Stays as change for next time, in dollars
            </span>
          </div>
          <Stepper
            label="Dollars left in box"
            value={left / 100}
            onChange={setLeftDollars}
          />
        </div>
        <dl className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Revenue (close − open)</dt>
            <dd className="font-medium tabular-nums">
              {formatCents(day.revenueCents)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              Deposit (close − left in box)
            </dt>
            <dd className="font-heading text-lg font-semibold tabular-nums">
              {formatCents(deposit)}
            </dd>
          </div>
        </dl>
        {counted && deposit < 0 && (
          <p
            role="status"
            className="bg-bad-bg text-bad rounded-lg p-2 text-sm"
          >
            Left in box is more than you counted.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="close-note">Note (optional)</Label>
          <textarea
            id="close-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What ran out, or what kids asked for"
            className="border-input bg-card text-foreground min-h-16 rounded-lg border px-3 py-2"
          />
        </div>
      </section>

      <Dock
        heading="Close count"
        detail={formatCents(day.closeCents)}
        action={
          <Button
            type="button"
            className="text-primary-foreground min-h-12"
            disabled={
              !counted ||
              deposit < 0 ||
              syncStatus !== 'saved' ||
              close.isPending
            }
            onClick={() =>
              close.mutate(
                { saleDayId: day.id, leftInBoxCents: left, note },
                { onError: showError },
              )
            }
          >
            Close sale day
          </Button>
        }
      />
    </>
  )
}
