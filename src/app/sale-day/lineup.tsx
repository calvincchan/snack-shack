import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/item-bits'
import { priceLabel } from '@/lib/pricing'
import {
  useLineup,
  useLineupOptions,
  useResetLineup,
  useToggleLineupItem,
  type LineupOption,
  type SaleDay,
} from '@/lib/sale-day'

/** Step 1: pick what goes on the table today (HANDOFF §4.1). */
export function Lineup({
  saleDay,
  onCheckStock,
}: {
  saleDay: SaleDay
  onCheckStock: () => void
}) {
  const options = useLineupOptions()
  const lineup = useLineup(saleDay.id)
  const toggle = useToggleLineupItem()
  const reset = useResetLineup()

  const picked = new Set((lineup.data ?? []).map((item) => item.itemId))
  const all = options.data ?? []
  const snacks = all.filter((option) => option.type === 'snack')
  const treats = all.filter((option) => option.type === 'treat')
  const chosen = saleDay.snacks + saleDay.treats

  return (
    <>
      <p className="bg-accent text-accent-foreground rounded-xl p-3 text-sm">
        Kids only see these items today. Aim for 4–6, with 1–2 treats. The
        suggestion favours new items, slow sellers that need clearing, things
        that sold out lately, and things that haven&apos;t been out in a while.
      </p>

      {options.isError && (
        <p role="alert" className="text-destructive text-sm">
          Could not load the items. Check your connection and try again.
        </p>
      )}

      <Group
        title="Snacks"
        options={snacks}
        picked={picked}
        onToggle={(option) =>
          toggle.mutate(
            {
              saleDayId: saleDay.id,
              itemId: option.itemId,
              picked: picked.has(option.itemId),
            },
            { onError: (error) => toast.error(error.message) },
          )
        }
      />
      <Group
        title="Treats"
        options={treats}
        picked={picked}
        onToggle={(option) =>
          toggle.mutate(
            {
              saleDayId: saleDay.id,
              itemId: option.itemId,
              picked: picked.has(option.itemId),
            },
            { onError: (error) => toast.error(error.message) },
          )
        }
      />

      <Button
        type="button"
        variant="outline"
        className="text-foreground min-h-11 self-start"
        disabled={reset.isPending}
        onClick={() =>
          reset.mutate(saleDay.id, {
            onError: (error) => toast.error(error.message),
          })
        }
      >
        Reset to suggestion
      </Button>

      <Dock
        heading={
          saleDay.margin === null
            ? "Today's lineup"
            : `Today's lineup · about ${Math.round(saleDay.margin * 100)}% margin`
        }
        detail={`${saleDay.snacks} ${saleDay.snacks === 1 ? 'snack' : 'snacks'} · ${saleDay.treats} ${saleDay.treats === 1 ? 'treat' : 'treats'}`}
        action={
          <Button
            type="button"
            className="text-primary-foreground min-h-12"
            disabled={chosen === 0}
            onClick={onCheckStock}
          >
            Check stock
          </Button>
        }
      />
    </>
  )
}

function Group({
  title,
  options,
  picked,
  onToggle,
}: {
  title: string
  options: LineupOption[]
  picked: Set<string>
  onToggle: (option: LineupOption) => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-baseline gap-2">
        <span className="font-heading text-lg font-semibold">{title}</span>
        <span className="text-muted-foreground text-sm">
          {options.length} in storage
        </span>
      </h2>

      {options.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing priced and in stock right now.
        </p>
      ) : (
        <ul
          aria-label={title}
          className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border"
        >
          {options.map((option) => (
            <li key={option.itemId}>
              <button
                type="button"
                aria-pressed={picked.has(option.itemId)}
                onClick={() => onToggle(option)}
                className="hover:bg-accent flex min-h-14 w-full items-center gap-3 p-3 text-left"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md border',
                    picked.has(option.itemId)
                      ? 'bg-snack border-snack text-white'
                      : 'border-border bg-card',
                  )}
                >
                  {picked.has(option.itemId) && <Check className="size-4" />}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {option.name}
                    {option.storage === 'freezer' && <Tag>❄ Freezer</Tag>}
                  </span>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {priceLabel(option.priceCents, option.bundleSize)} ·{' '}
                    {option.onHand} in storage
                  </span>
                </span>

                {option.reason && <ReasonTag reason={option.reason} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** New, Sold out lately, Not out for N sales — and Slow seller in amber. */
function ReasonTag({ reason }: { reason: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-1 text-xs font-medium',
        reason === 'Slow seller' ? 'bg-warn-bg text-warn' : 'bg-ok-bg text-ok',
      )}
    >
      {reason}
    </span>
  )
}

/** The bottom bar: where the sale day stands, and the one way onward. */
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
