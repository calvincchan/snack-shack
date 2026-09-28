/**
 * Money is integer cents everywhere except the screen. Format at the edge.
 */

const dollars = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

/** 3000 -> "$30.00" */
export function formatCents(cents: number): string {
  return dollars.format(cents / 100)
}

/** 3000 -> "30.00", for a text input the volunteer can edit. */
export function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** "30", "30.5", " $30.50 " -> 3000, 3050, 3050. NaN when it isn't a number. */
export function dollarStringToCents(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (cleaned === '') return Number.NaN
  const amount = Number(cleaned)
  if (!Number.isFinite(amount)) return Number.NaN
  return Math.round(amount * 100)
}
