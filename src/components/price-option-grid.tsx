import { cn } from 'cn'
import {
  formatMargin,
  priceLabel,
  priceOptions,
  type PriceOption,
} from '@/lib/pricing'

/**
 * The four price options for a cost, each with its margin band. With `chosen`
 * set, the grid is a picker; without it, the suggested option is outlined and
 * each tap acts at once.
 */
export function PriceOptionGrid({
  costPerPieceCents,
  chosen,
  disabled,
  onPick,
}: {
  costPerPieceCents: number
  /** The current price; a null price (not set yet) picks nothing. */
  chosen?: { priceCents: number | null; bundleSize: number } | null
  disabled?: boolean
  onPick: (option: PriceOption) => void
}) {
  const picker = chosen !== undefined

  return (
    <div className="grid grid-cols-2 gap-2">
      {priceOptions(costPerPieceCents).map((option) => {
        const isChosen =
          chosen?.priceCents === option.priceCents &&
          chosen.bundleSize === option.bundleSize
        return (
          <button
            key={`${option.priceCents}-${option.bundleSize}`}
            type="button"
            aria-pressed={picker ? isChosen : undefined}
            disabled={disabled}
            onClick={() =>
              onPick({
                priceCents: option.priceCents,
                bundleSize: option.bundleSize,
              })
            }
            className={cn(
              'border-border text-foreground bg-card flex min-h-16 flex-col items-start gap-1 rounded-lg border p-3 text-left',
              picker
                ? isChosen && 'border-primary ring-primary ring-2'
                : [
                    'hover:bg-accent disabled:opacity-60',
                    option.suggested && 'border-primary',
                  ],
            )}
          >
            <span className="flex w-full items-baseline justify-between gap-2">
              <span className="font-heading text-lg font-semibold">
                {priceLabel(option.priceCents, option.bundleSize)}
              </span>
              {option.suggested && (
                <span className="text-ok text-xs font-semibold tracking-wide uppercase">
                  Suggested
                </span>
              )}
            </span>
            <span className="text-muted-foreground text-sm">
              {option.band.label} · {formatMargin(option.margin)} margin
            </span>
          </button>
        )
      })}
    </div>
  )
}
