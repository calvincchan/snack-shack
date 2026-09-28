/**
 * Prices, margins and bands (HANDOFF §5.1 and §5.3).
 *
 * Costs are cents per piece and may be fractional (13.84¢ for a mini bar).
 * Prices are whole cents with a bundle size: "2 for $1" is 100 over 2.
 */

export type PriceOption = {
  priceCents: number
  bundleSize: number
}

/** The only prices the table uses: $1, $2, 2 for $1, 3 for $1. */
export const PRICE_OPTIONS: readonly PriceOption[] = [
  { priceCents: 100, bundleSize: 1 },
  { priceCents: 200, bundleSize: 1 },
  { priceCents: 100, bundleSize: 2 },
  { priceCents: 100, bundleSize: 3 },
]

/** "$1", "$2", "2 for $1". A null price means the item still needs one. */
export function priceLabel(priceCents: number | null, bundleSize = 1): string {
  if (priceCents === null) return 'Needs a price'
  const dollars = `$${priceCents / 100}`
  return bundleSize > 1 ? `${bundleSize} for ${dollars}` : dollars
}

/** margin = 1 − (cost per piece × pieces per deal) ÷ price */
export function marginOf(
  costPerPieceCents: number,
  priceCents: number,
  bundleSize = 1,
): number {
  return 1 - (costPerPieceCents * bundleSize) / priceCents
}

export type BandTone = 'ok' | 'warn' | 'bad'
export type MarginBand = { tone: BandTone; label: string }

export function marginBand(margin: number): MarginBand {
  if (margin >= 0.6) return { tone: 'ok', label: 'Great deal' }
  if (margin >= 0.45) return { tone: 'ok', label: 'Good' }
  if (margin >= 0.3) return { tone: 'warn', label: 'Fair' }
  if (margin >= 0) return { tone: 'warn', label: 'Low margin' }
  return { tone: 'bad', label: 'At a loss' }
}

/** What each deal loses, for the "Loses $0.08 each" line. Zero when it doesn't. */
export function lossPerDealCents(
  costPerPieceCents: number,
  priceCents: number,
  bundleSize = 1,
): number {
  return Math.max(0, costPerPieceCents * bundleSize - priceCents)
}

/** "72%". Margins below zero are shown as the loss instead, not a percentage. */
export function formatMargin(margin: number): string {
  return `${Math.round(margin * 100)}%`
}

export type PricedOption = PriceOption & {
  margin: number
  band: MarginBand
  suggested: boolean
}

/**
 * Every price option for a cost, with the suggested one marked. First rule
 * that matches wins (HANDOFF §5.3):
 *
 *   1. a $1 option, single or deal, with margin 45–75%; the highest if several
 *   2. $2 single with margin 45–85%
 *   3. otherwise the highest margin
 */
export function priceOptions(costPerPieceCents: number): PricedOption[] {
  const options = PRICE_OPTIONS.map((option) => {
    const margin = marginOf(
      costPerPieceCents,
      option.priceCents,
      option.bundleSize,
    )
    return { ...option, margin, band: marginBand(margin), suggested: false }
  })

  const byMargin = (a: PricedOption, b: PricedOption) => b.margin - a.margin
  const within = (option: PricedOption, low: number, high: number) =>
    option.margin >= low && option.margin <= high

  const suggested =
    options
      .filter((o) => o.priceCents === 100 && within(o, 0.45, 0.75))
      .sort(byMargin)[0] ??
    options.find(
      (o) =>
        o.priceCents === 200 && o.bundleSize === 1 && within(o, 0.45, 0.85),
    ) ??
    [...options].sort(byMargin)[0]

  suggested.suggested = true
  return options
}
