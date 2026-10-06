import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, CircleAlert, Loader } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { OverShortPill } from '@/components/over-short-pill'
import { Stepper } from '@/components/stepper'
import { TypeDot } from '@/components/item-bits'
import { Dock } from '@/app/sale-day/lineup'
import { useAuth } from '@/lib/auth'
import { formatCents } from '@/lib/money'
import { useLiveValue } from '@/lib/live-value'
import { outMax, type Activity } from '@/lib/presence'
import {
  DENOMINATIONS,
  canFinish,
  overShortLabel,
  overShortStatus,
  soldLabel,
  useCashCounts,
  useCountSyncStatus,
  type CountSyncStatus,
  useCountItems,
  useFinishCount,
  useSaleDayNotes,
  useSetCash,
  useSetHelperCredits,
  useSetLeftOut,
  useSetNote,
  useSignOff,
  useSignoffs,
  useThresholds,
  useTotals,
  type CountItem,
  type Thresholds,
  type Totals,
} from '@/lib/count-up'
import type { SaleDay } from '@/lib/sale-day'

type Part = 'stock' | 'cash' | 'sign'

const PARTS: { id: Part; label: string }[] = [
  { id: 'stock', label: '1 Stock' },
  { id: 'cash', label: '2 Cash' },
  { id: 'sign', label: '3 Sign-off' },
]

/**
 * A stepper runs on local state so a tap feels instant, and writes once the
 * volunteer stops tapping. Each field has its own timer, so tapping $20 then
 * $10 saves both, and leaving the screen saves what is still waiting.
 */
function useDebouncedSave() {
  const waiting = useRef(
    new Map<
      string,
      { timer: ReturnType<typeof setTimeout>; save: () => void }
    >(),
  )
  useEffect(() => {
    const map = waiting.current
    return () => {
      for (const { timer, save } of map.values()) {
        clearTimeout(timer)
        save()
      }
      map.clear()
    }
  }, [])
  return (key: string, save: () => void) => {
    const map = waiting.current
    const earlier = map.get(key)
    if (earlier) clearTimeout(earlier.timer)
    const timer = setTimeout(() => {
      map.delete(key)
      save()
    }, 400)
    map.set(key, { timer, save })
  }
}

const showError = (error: Error) => toast.error(error.message)

/** Says whether every count is saved, saving, or refused. */
const SYNC: Record<
  CountSyncStatus,
  { Icon: typeof Check; label: string; className: string }
> = {
  saved: { Icon: Check, label: 'Saved', className: 'text-muted-foreground' },
  saving: {
    Icon: Loader,
    label: 'Saving…',
    className: 'text-muted-foreground',
  },
  failed: { Icon: CircleAlert, label: 'Not saved', className: 'text-bad' },
}

function SyncIndicator() {
  const { Icon, label, className } = SYNC[useCountSyncStatus()]
  return (
    <p
      role="status"
      className={cn(
        'flex items-center justify-end gap-1.5 text-sm font-medium',
        className,
      )}
    >
      <Icon aria-hidden size={16} />
      {label}
    </p>
  )
}

/** Step 4, Count up: check stock, count cash, one-volunteer sign-off (HANDOFF §4.1). */
export function CountUp({
  saleDay,
  onActivity,
}: {
  saleDay: SaleDay
  onActivity: (activity: Activity) => void
}) {
  const [part, setPart] = useState<Part>('stock')
  useEffect(() => onActivity(part), [part, onActivity])
  const totals = useTotals(saleDay.id)
  const thresholds = useThresholds()

  return (
    <>
      <SyncIndicator />
      <div
        role="group"
        aria-label="Count up parts"
        className="border-border grid grid-cols-3 overflow-hidden rounded-lg border"
      >
        {PARTS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={part === option.id}
            onClick={() => setPart(option.id)}
            className={cn(
              'min-h-11 px-2 text-sm font-medium',
              part === option.id
                ? 'bg-accent text-accent-foreground'
                : 'bg-card text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {part === 'stock' && (
        <CountStock
          saleDay={saleDay}
          totals={totals.data}
          onNext={() => setPart('cash')}
        />
      )}
      {part === 'cash' && (
        <CountCash
          saleDay={saleDay}
          totals={totals.data}
          thresholds={thresholds.data}
          onBack={() => setPart('stock')}
          onNext={() => setPart('sign')}
        />
      )}
      {part === 'sign' && (
        <SignOff
          saleDay={saleDay}
          totals={totals.data}
          thresholds={thresholds.data}
          onBack={() => setPart('cash')}
        />
      )}
    </>
  )
}

function CountStock({
  saleDay,
  totals,
  onNext,
}: {
  saleDay: SaleDay
  totals: Totals | undefined
  onNext: () => void
}) {
  const items = useCountItems(saleDay.id)

  return (
    <>
      <p className="bg-accent text-accent-foreground rounded-xl p-3 text-sm">
        Count what&apos;s left in each box. Put anything given away or thrown
        out under <b>Out</b>.
      </p>

      <ul
        aria-label="Count stock"
        className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border"
      >
        {(items.data ?? []).map((item) => (
          <StockRow key={item.itemId} saleDayId={saleDay.id} item={item} />
        ))}
      </ul>

      <Dock
        heading={`${totals?.piecesSold ?? 0} pieces sold`}
        detail={formatCents(totals?.salesCents ?? 0)}
        action={
          <Button
            type="button"
            className="text-primary-foreground min-h-12"
            onClick={onNext}
          >
            Count cash
          </Button>
        }
      />
    </>
  )
}

function StockRow({ saleDayId, item }: { saleDayId: string; item: CountItem }) {
  const save = useSetLeftOut(item.itemId)
  const debounce = useDebouncedSave()
  const [left, setLeft] = useLiveValue(item.leftCount)
  const [out, setOut] = useLiveValue(item.outCount)

  const persist = (nextLeft: number, nextOut: number) =>
    debounce(item.itemId, () =>
      save.mutate(
        {
          kind: 'left-out',
          saleDayId,
          itemId: item.itemId,
          left: nextLeft,
          out: nextOut,
        },
        {
          onError: (error) => {
            // Let the stepper follow the server again instead of pinning to a
            // value that never saved.
            setLeft(null)
            setOut(null)
            showError(error)
          },
        },
      ),
    )

  const over = left > item.startCount

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <TypeDot type={item.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">{item.name}</span>
          <span className="text-muted-foreground text-sm tabular-nums">
            Started with {item.startCount}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          Left
          <Stepper
            label={`${item.name} left`}
            value={left}
            max={item.startCount + 99}
            onChange={(next) => {
              // Raising Left must not leave Out above the starting count.
              const nextOut = Math.min(out, outMax(item.startCount, next))
              setLeft(next)
              if (nextOut !== out) setOut(nextOut)
              persist(next, nextOut)
            }}
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          Out
          <Stepper
            label={`${item.name} out`}
            value={out}
            max={outMax(item.startCount, left)}
            onChange={(next) => {
              setOut(next)
              persist(left, next)
            }}
          />
        </div>
      </div>

      {over ? (
        <p role="alert" className="text-bad text-sm font-semibold">
          {left - item.startCount} more than you started with. Recount.
        </p>
      ) : (
        <p className="text-sm font-semibold tabular-nums">
          {soldLabel(item.soldPieces, item.bundleSize, item.salesCents)}
        </p>
      )}
    </li>
  )
}

function CountCash({
  saleDay,
  totals,
  thresholds,
  onBack,
  onNext,
}: {
  saleDay: SaleDay
  totals: Totals | undefined
  thresholds: Thresholds | undefined
  onBack: () => void
  onNext: () => void
}) {
  const cash = useCashCounts(saleDay.id)
  const notes = useSaleDayNotes(saleDay.id)
  const setCash = useSetCash()
  const setCredits = useSetHelperCredits()
  const debounce = useDebouncedSave()

  if (!cash.data || !notes.data) {
    return <p className="text-muted-foreground text-sm">Loading…</p>
  }

  const status = thresholds
    ? overShortStatus(
        totals?.overShortCents ?? 0,
        thresholds.okCents,
        thresholds.warnCents,
      )
    : 'ok'

  return (
    <>
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-medium">Helper credits</span>
            <span className="text-muted-foreground text-sm">
              $1 snacks for the student helper, taken out of expected cash
            </span>
          </div>
          <CashStepper
            label="Helper credits"
            initial={notes.data.helperCredits}
            onSave={(credits) =>
              debounce('credits', () =>
                setCredits.mutate(
                  { kind: 'helper-credits', saleDayId: saleDay.id, credits },
                  { onError: showError },
                ),
              )
            }
          />
        </div>
      </section>

      <ul
        aria-label="Count cash"
        className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border"
      >
        {DENOMINATIONS.map((denom) => (
          <li
            key={denom.cents}
            className="flex items-center justify-between gap-3 p-3"
          >
            <span className="font-medium">{denom.label}</span>
            <CashStepper
              label={denom.label}
              initial={cash.data[denom.cents] ?? 0}
              onSave={(qty) =>
                debounce(String(denom.cents), () =>
                  setCash.mutate(
                    {
                      kind: 'cash',
                      saleDayId: saleDay.id,
                      denomCents: denom.cents,
                      qty,
                    },
                    { onError: showError },
                  ),
                )
              }
            />
          </li>
        ))}
      </ul>

      {status === 'warn' && (
        <p className="bg-accent text-accent-foreground rounded-xl p-3 text-sm">
          Recount once, then add a note.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="text-foreground min-h-12 w-full"
        onClick={onBack}
      >
        Back to stock
      </Button>

      <Dock
        heading={`Counted ${formatCents(totals?.countedCents ?? 0)} of ${formatCents(totals?.expectedCents ?? 0)}`}
        detail={overShortLabel(totals?.overShortCents ?? 0)}
        action={
          <div className="flex items-center gap-2">
            <OverShortPill
              cents={totals?.overShortCents ?? 0}
              thresholds={thresholds}
            />
            <Button
              type="button"
              className="text-primary-foreground min-h-12"
              onClick={onNext}
            >
              Sign off
            </Button>
          </div>
        }
      />
    </>
  )
}

function CashStepper({
  label,
  initial,
  onSave,
}: {
  label: string
  initial: number
  onSave: (value: number) => void
}) {
  const [value, setValue] = useLiveValue(initial)
  return (
    <Stepper
      label={label}
      value={value}
      onChange={(next) => {
        setValue(next)
        onSave(next)
      }}
    />
  )
}

function SignOff({
  saleDay,
  totals,
  thresholds,
  onBack,
}: {
  saleDay: SaleDay
  totals: Totals | undefined
  thresholds: Thresholds | undefined
  onBack: () => void
}) {
  const { profile } = useAuth()
  const notes = useSaleDayNotes(saleDay.id)
  const signoffs = useSignoffs(saleDay.id)
  const setNote = useSetNote()
  const signOff = useSignOff()
  const finish = useFinishCount()
  // Counts still saving, or not saved, would land after these, so hold both.
  const syncStatus = useCountSyncStatus()
  const unsaved = syncStatus !== 'saved'
  const [note, setLocalNote] = useState<string | null>(null)
  // Sign-offs vanish when any count changes after someone signed; say so.
  const [seen, setSeen] = useState(0)
  const [cleared, setCleared] = useState(false)
  const count = signoffs.data?.length
  if (count !== undefined && count !== seen) {
    setCleared(count < seen)
    setSeen(count)
  }

  if (!totals || !notes.data) {
    return <p className="text-muted-foreground text-sm">Loading…</p>
  }

  const signed = signoffs.data ?? []
  const iSigned = signed.some((entry) => entry.userId === profile?.id)
  const ready = canFinish(totals)
  const rows: [string, string][] = [
    ['Pieces sold', String(totals.piecesSold)],
    ['Sales', formatCents(totals.salesCents)],
    ['Helper credits', String(totals.helperCredits)],
    ['Change float', formatCents(totals.floatCents)],
    ['Expected', formatCents(totals.expectedCents)],
    ['Counted', formatCents(totals.countedCents)],
  ]

  return (
    <>
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
        <dl className="flex flex-col gap-2">
          {rows.map(([term, value]) => (
            <div key={term} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Over / short</dt>
            <dd>
              <OverShortPill
                cents={totals.overShortCents}
                thresholds={thresholds}
              />
            </dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-col gap-2">
        <label htmlFor="count-note" className="text-sm font-medium">
          Note (optional)
        </label>
        <textarea
          id="count-note"
          rows={3}
          placeholder="What ran out first, or what kids asked for"
          value={note ?? notes.data.note}
          onChange={(event) => setLocalNote(event.target.value)}
          onBlur={() =>
            note !== null &&
            setNote.mutate(
              { kind: 'note', saleDayId: saleDay.id, note },
              { onError: showError },
            )
          }
          className="border-border bg-card text-foreground min-h-20 rounded-lg border p-3 text-base"
        />
      </div>

      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
        <h3 className="font-medium">A volunteer confirms</h3>
        <p className="text-muted-foreground text-sm">
          {signed.length === 0
            ? 'Nobody has confirmed yet.'
            : `Confirmed by ${signed.map((entry) => entry.name).join(' and ')}.`}
        </p>
        {cleared && (
          <p role="alert" className="text-warn text-sm font-semibold">
            A count changed, so the confirmations were cleared. Confirm again.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="text-foreground min-h-12"
          disabled={iSigned || signOff.isPending || unsaved}
          onClick={() => signOff.mutate(saleDay.id, { onError: showError })}
        >
          {iSigned ? 'You confirmed' : 'I counted and confirm'}
        </Button>
      </section>

      {unsaved && (
        <p className="text-muted-foreground text-sm">
          {syncStatus === 'saving'
            ? 'Counts are still saving.'
            : 'Some counts did not save. Check them and try again.'}
        </p>
      )}

      {totals.itemsOverStart > 0 && (
        <p role="alert" className="text-bad text-sm font-semibold">
          Some items show more left than you started with. Recount them.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="text-foreground min-h-12 w-full"
        onClick={onBack}
      >
        Back to cash
      </Button>

      <Button
        type="button"
        className="text-primary-foreground min-h-12 w-full"
        disabled={!ready || finish.isPending || unsaved}
        onClick={async () => {
          try {
            // The note saves on blur, which can lose the race with this tap.
            if (note !== null) {
              await setNote.mutateAsync({
                kind: 'note',
                saleDayId: saleDay.id,
                note,
              })
            }
            await finish.mutateAsync(saleDay.id)
          } catch (error) {
            showError(error as Error)
          }
        }}
      >
        Finish count up
      </Button>
    </>
  )
}
