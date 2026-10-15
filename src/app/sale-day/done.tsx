import { Button } from '@/components/ui/button'
import { formatCents } from '@/lib/money'
import { formatSaleDate } from '@/lib/time'
import type { SaleDay } from '@/lib/sale-day'

/** After closing: the one number the volunteers need (HANDOFF §4.1). */
export function Done({
  saleDay,
  onClose,
}: {
  saleDay: SaleDay
  onClose: () => void
}) {
  const rows: [string, string][] = [
    ['Open count', formatCents(saleDay.openCents)],
    ['Close count', formatCents(saleDay.closeCents)],
    ['Revenue', formatCents(saleDay.revenueCents)],
    ['Closed by', saleDay.closedBy ?? '—'],
  ]

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Done
        </p>
        <h1 className="font-heading text-2xl font-semibold">
          Seal {formatCents(saleDay.depositCents ?? 0)} in the deposit bag
        </h1>
        <p className="text-muted-foreground text-sm">
          Write {formatSaleDate(saleDay.saleDate)} and your names on the bag.
          Leave {formatCents(saleDay.leftInBoxCents ?? 0)} in the box.
        </p>
        <dl className="flex flex-col gap-2">
          {rows.map(([term, value]) => (
            <div key={term} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Button
        type="button"
        className="text-primary-foreground min-h-12"
        onClick={onClose}
      >
        Back to sale day
      </Button>
    </div>
  )
}
