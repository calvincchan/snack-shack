import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Stepper } from '@/components/stepper'
import { Tag, TypeDot } from '@/components/item-bits'
import { formatCents } from '@/lib/money'
import { Dock } from '@/app/sale-day/lineup'
import {
  useLineup,
  useSetCheckCount,
  floatToSend,
  useStartSale,
  type CheckReason,
  type LineupItem,
  type SaleDay,
} from '@/lib/sale-day'

/** Step 2: count each box before any money changes hands (HANDOFF §4.1). */
export function CheckStock({
  saleDay,
  onBack,
}: {
  saleDay: SaleDay
  onBack: () => void
}) {
  const lineup = useLineup(saleDay.id)
  const start = useStartSale()

  // The counted float stays on this phone until Start sale (ADR-0003).
  const [floatCents, setFloatCents] = useState(saleDay.floatCents)

  const items = lineup.data ?? []
  const off = items.filter(
    (item) =>
      item.checkCount !== null && item.checkCount !== item.expectedCount,
  ).length

  return (
    <>
      <p className="bg-accent text-accent-foreground rounded-xl p-3 text-sm">
        Count each box before selling. If a box is sealed or clearly untouched,
        tap <b>Matches</b>. If something is missing or damaged, set the real
        count and pick why.
      </p>

      <ul
        aria-label="Check stock"
        className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border"
      >
        {items.map((item) => (
          <CheckRow key={item.itemId} saleDayId={saleDay.id} item={item} />
        ))}
      </ul>

      <FloatRow
        expectedCents={saleDay.floatCents}
        countedCents={floatCents}
        onChange={setFloatCents}
      />

      <Button
        type="button"
        variant="outline"
        className="text-foreground min-h-12 w-full"
        onClick={onBack}
      >
        Back to lineup
      </Button>

      <Dock
        heading="Differences"
        detail={
          off === 0 ? 'All match' : `${off} ${off === 1 ? 'item' : 'items'} off`
        }
        action={
          <Button
            type="button"
            className="text-primary-foreground min-h-12"
            disabled={start.isPending || items.length === 0}
            onClick={() =>
              start.mutate(
                {
                  saleDayId: saleDay.id,
                  floatCents: floatToSend(floatCents, saleDay.floatCents),
                },
                {
                  onSuccess: () =>
                    toast.success(
                      off === 0
                        ? 'Sale started.'
                        : 'Differences reported. Sale started.',
                    ),
                  // The database functions word their own refusals; show them.
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            Start sale
          </Button>
        }
      />
    </>
  )
}

function FloatRow({
  expectedCents,
  countedCents,
  onChange,
}: {
  expectedCents: number
  countedCents: number
  onChange: (cents: number) => void
}) {
  const matches = countedCents === expectedCents
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">Change float</span>
          <span className="text-muted-foreground text-sm tabular-nums">
            Box should hold {formatCents(expectedCents)}
            {matches && (
              <>
                {' · '}
                <span className="text-ok font-semibold">matches</span>
              </>
            )}
          </span>
        </div>
        <Stepper
          label="Change float in dollars"
          value={Math.round(countedCents / 100)}
          onChange={(dollars) => onChange(dollars * 100)}
        />
      </div>
      {!matches && (
        <div className="flex items-center gap-2">
          <span className="text-warn flex-1 text-sm font-semibold tabular-nums">
            Counted {formatCents(countedCents)}
          </span>
          <Button
            type="button"
            variant="outline"
            className="text-foreground min-h-11"
            onClick={() => onChange(expectedCents)}
          >
            Matches
          </Button>
        </div>
      )}
    </div>
  )
}

const REASONS: readonly CheckReason[] = ['missing', 'damaged']

function CheckRow({
  saleDayId,
  item,
}: {
  saleDayId: string
  item: LineupItem
}) {
  const save = useSetCheckCount()
  const [count, setCount] = useState(item.checkCount ?? item.expectedCount)
  const [reason, setReason] = useState<CheckReason>(
    item.checkReason ?? 'missing',
  )

  // A tap should feel instant, so the stepper runs on local state and the row
  // is written once the volunteer stops tapping.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persist = (next: number, nextReason: CheckReason) => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(() => {
      save.mutate(
        {
          saleDayId,
          itemId: item.itemId,
          count: next,
          expected: item.expectedCount,
          reason: nextReason,
        },
        { onError: (error) => toast.error(error.message) },
      )
    }, 400)
  }
  useEffect(
    () => () => void (pending.current && clearTimeout(pending.current)),
    [],
  )

  const change = (next: number) => {
    setCount(next)
    persist(next, reason)
  }
  const pickReason = (next: CheckReason) => {
    setReason(next)
    persist(count, next)
  }

  const difference = count - item.expectedCount

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <TypeDot type={item.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {item.name}
            {item.storage === 'freezer' && <Tag>❄ Freezer</Tag>}
          </span>
          <span className="text-muted-foreground text-sm tabular-nums">
            App expects {item.expectedCount}
            {difference === 0 && (
              <>
                {' · '}
                <span className="text-ok font-semibold">matches</span>
              </>
            )}
          </span>
        </div>
        <Stepper label={item.name} value={count} onChange={change} />
      </div>

      {difference !== 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'flex-1 text-sm font-semibold tabular-nums',
              difference < 0 ? 'text-bad' : 'text-warn',
            )}
          >
            {difference < 0
              ? `${-difference} short`
              : `${difference} extra found`}
          </span>

          {difference < 0 && (
            <div
              role="group"
              aria-label={`Why ${item.name} is short`}
              className="border-border flex overflow-hidden rounded-lg border"
            >
              {REASONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={reason === option}
                  onClick={() => pickReason(option)}
                  className={cn(
                    'min-h-11 px-3 text-sm font-medium capitalize',
                    reason === option
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-card text-foreground',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="text-foreground min-h-11"
            onClick={() => change(item.expectedCount)}
          >
            Matches
          </Button>
        </div>
      )}
    </li>
  )
}
