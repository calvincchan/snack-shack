import {
  marginBand,
  priceOptions,
  type MarginBand,
  type PricedOption,
} from '@/lib/pricing'

/**
 * The in-aisle calculator (HANDOFF §5.4). Everything here is arithmetic on
 * numbers that are not in the database yet, so it lives in the browser.
 */
export type DealInput = {
  /** What the shelf label says, in cents. */
  shelfCents: number
  pieces: number
  /** Shelf labels leave GST off, so the calculator adds it by default. */
  addGst: boolean
  gstRate: number
  /** Average cost of a piece of this type, for the comparison line. */
  usualCostCents: number | null
  /** Pieces one item of this type sells on a day it is out. */
  piecesPerDayOut: number | null
}

export type Deal = {
  totalCents: number
  costPerPieceCents: number
  options: PricedOption[]
  suggested: PricedOption
  band: MarginBand
  /** Whole deals in the box; the last few pieces may not make one. */
  deals: number
  salesCents: number
  profitCents: number
  /** Positive when a piece costs more than usual, null when there is nothing to compare. */
  differenceFromUsualCents: number | null
  saleDays: number | null
  /** More than about six sale days of one item is more than storage holds. */
  tooBig: boolean
}

/** Rounded to the cent, because the shelf price is. */
export function dealCheck(input: DealInput): Deal | null {
  const { shelfCents, pieces, addGst, gstRate } = input
  if (!Number.isFinite(shelfCents) || !Number.isFinite(pieces)) return null
  if (shelfCents <= 0 || pieces <= 0) return null

  const totalCents = addGst
    ? Math.round(shelfCents * (1 + gstRate))
    : shelfCents
  const costPerPieceCents = totalCents / pieces

  const options = priceOptions(costPerPieceCents)
  const suggested = options.find((option) => option.suggested)!

  const deals = Math.floor(pieces / suggested.bundleSize)
  const salesCents = deals * suggested.priceCents
  // The rate counts pieces, so divide pieces, not deals (issue #29).
  const saleDays =
    input.piecesPerDayOut && input.piecesPerDayOut > 0
      ? pieces / input.piecesPerDayOut
      : null

  return {
    totalCents,
    costPerPieceCents,
    options,
    suggested,
    band: marginBand(suggested.margin),
    deals,
    salesCents,
    profitCents: salesCents - totalCents,
    differenceFromUsualCents:
      input.usualCostCents === null
        ? null
        : costPerPieceCents - input.usualCostCents,
    saleDays,
    tooBig: saleDays !== null && saleDays > 6,
  }
}
