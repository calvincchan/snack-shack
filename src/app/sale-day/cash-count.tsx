import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Check, CircleAlert, Loader } from 'lucide-react'
import { cn } from 'cn'
import { Stepper } from '@/components/stepper'
import { formatCents } from '@/lib/money'
import { useLiveValue } from '@/lib/live-value'
import {
  DENOMINATIONS,
  useCashCounts,
  useCountSyncStatus,
  useSetCash,
  type CountKind,
  type CountSyncStatus,
} from '@/lib/sale-day'

/**
 * A stepper runs on local state so a tap feels instant, and writes once the
 * volunteer stops tapping. Each denomination has its own timer, so tapping $20
 * then $10 saves both, and leaving the screen saves what is still waiting.
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

/** One stepper per bill and coin (variant A of the 2026-10-15 prototype). */
export function CashCount({
  saleDayId,
  kind,
}: {
  saleDayId: string
  kind: CountKind
}) {
  const cash = useCashCounts(saleDayId, kind)
  const debounce = useDebouncedSave()

  if (!cash.data) {
    return <p className="text-muted-foreground text-sm">Loading…</p>
  }

  return (
    <ul
      aria-label={kind === 'open' ? 'Open count' : 'Close count'}
      className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border"
    >
      {DENOMINATIONS.map((denom) => (
        <DenominationRow
          key={denom.cents}
          saleDayId={saleDayId}
          kind={kind}
          cents={denom.cents}
          label={denom.label}
          server={cash.data[denom.cents] ?? 0}
          debounce={debounce}
        />
      ))}
    </ul>
  )
}

function DenominationRow({
  saleDayId,
  kind,
  cents,
  label,
  server,
  debounce,
}: {
  saleDayId: string
  kind: CountKind
  cents: number
  label: string
  server: number
  debounce: (key: string, save: () => void) => void
}) {
  const [value, setValue] = useLiveValue(server)
  const setCash = useSetCash(kind, cents)

  return (
    <li className="flex items-center gap-3 p-3">
      <span className="flex-1 font-medium">{label}</span>
      <Stepper
        label={label}
        value={value}
        onChange={(qty) => {
          setValue(qty)
          debounce(String(cents), () =>
            setCash.mutate(
              { saleDayId, kind, denomCents: cents, qty },
              {
                onError: (error) => {
                  setValue(null)
                  toast.error(error.message)
                },
              },
            ),
          )
        }}
      />
      <span className="text-muted-foreground w-16 text-right text-sm tabular-nums">
        {formatCents(cents * value)}
      </span>
    </li>
  )
}

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

export function SyncIndicator() {
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

/** The sticky bar at the bottom: a running total and the next step. */
export function Dock({
  heading,
  detail,
  action,
}: {
  heading: string
  detail: string
  action: React.ReactNode
}) {
  return (
    <div className="border-border bg-card sticky bottom-0 -mx-4 mt-2 flex items-center gap-3 border-t px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-muted-foreground text-sm">{heading}</span>
        <span className="font-heading text-lg font-semibold tabular-nums">
          {detail}
        </span>
      </div>
      {action}
    </div>
  )
}
