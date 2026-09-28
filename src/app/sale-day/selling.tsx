import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tag, TypeDot } from '@/components/item-bits'
import { priceLabel } from '@/lib/pricing'
import {
  differenceLabel,
  useBeginCount,
  useCheckDifferences,
  useLineup,
  type SaleDay,
} from '@/lib/sale-day'

/** Step 3: what is on the table, at the prices the sale started with. */
export function Selling({ saleDay }: { saleDay: SaleDay }) {
  const lineup = useLineup(saleDay.id)
  const differences = useCheckDifferences(saleDay.id)
  const beginCount = useBeginCount()

  return (
    <>
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          On the table
        </h2>
        <ul aria-label="On the table" className="flex flex-col gap-3">
          {(lineup.data ?? []).map((item) => (
            <li key={item.itemId} className="flex items-center gap-3">
              <TypeDot type={item.type} />
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {item.name}
                {item.storage === 'freezer' && <Tag>❄ Freezer</Tag>}
              </span>
              <b className="font-heading shrink-0 tabular-nums">
                {priceLabel(item.priceCents, item.bundleSize)}
              </b>
            </li>
          ))}
        </ul>
      </section>

      {(differences.data ?? []).length > 0 && (
        <p className="bg-accent text-accent-foreground rounded-xl p-3 text-sm">
          Reported before the sale:{' '}
          {differences.data!.map(differenceLabel).join(', ')}.
        </p>
      )}

      <Button
        asChild
        variant="outline"
        className="text-foreground min-h-12 w-full"
      >
        <Link to="/sell">Open the Sell helper</Link>
      </Button>

      <Button
        type="button"
        className="text-primary-foreground min-h-12 w-full"
        disabled={beginCount.isPending}
        onClick={() =>
          beginCount.mutate(saleDay.id, {
            onError: (error) => toast.error(error.message),
          })
        }
      >
        Sale&apos;s over: count up
      </Button>
    </>
  )
}
