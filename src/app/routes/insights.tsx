import { formatCents } from '@/lib/money'
import { formatSaleDate } from '@/lib/time'
import { OverShortPill } from '@/components/over-short-pill'
import { useThresholds, type Thresholds } from '@/lib/count-up'
import {
  useInsightsItems,
  useInsightsSaleDays,
  useInsightsTerm,
  type InsightsItem,
  type InsightsSaleDay,
  type InsightsTerm,
} from '@/lib/insights'

export function InsightsPage() {
  const term = useInsightsTerm()
  const days = useInsightsSaleDays()
  const items = useInsightsItems()
  const thresholds = useThresholds()

  if (term.isPending || days.isPending || items.isPending) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>
  }
  if (term.isError || days.isError || items.isError) {
    return (
      <p role="alert" className="text-bad p-4 text-sm">
        Could not load Insights. Check your Wi-Fi and try again.
      </p>
    )
  }
  if (term.data.saleDays === 0) {
    return (
      <div className="p-4">
        <h1 className="font-heading text-xl font-semibold">Insights</h1>
        <p className="text-muted-foreground mt-2">
          No sale days yet this term.
        </p>
      </div>
    )
  }

  const notes = days.data.filter((day) => day.note)

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Insights</h1>
        <p className="text-muted-foreground text-sm">
          This term · {term.data.saleDays}{' '}
          {term.data.saleDays === 1 ? 'sale day' : 'sale days'}
        </p>
      </div>

      <Tiles term={term.data} />
      <SalesChart days={days.data} />
      <ItemsTable items={items.data} />
      <CashHistory days={days.data} thresholds={thresholds.data} />
      {notes.length > 0 && (
        <Section title="Count up notes">
          <ul className="divide-border divide-y">
            {notes.map((day) => (
              <li key={day.saleDayId} className="py-2 text-sm">
                <b>{formatSaleDate(day.saleDate)}</b> · {day.note}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Tile({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="border-border bg-card flex flex-col gap-1 rounded-xl border p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {detail}
      </span>
    </div>
  )
}

function Tiles({ term }: { term: InsightsTerm }) {
  const limit = `±${formatCents(term.overShortOkCents).replace('.00', '')}`
  const outside =
    term.salesOutsideOk === 1
      ? `1 sale over ${limit}`
      : `${term.salesOutsideOk} sales over ${limit}`
  const margin = term.marginPct === null ? '' : `${term.marginPct}% margin, `
  const netOverShort =
    term.overShortCents < 0
      ? `−${formatCents(-term.overShortCents)}`
      : formatCents(term.overShortCents)

  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile
        label="Sales"
        value={formatCents(term.salesCents)}
        detail={`${formatCents(term.salesPerDayCents)} per sale day`}
      />
      <Tile
        label="Profit after stock cost"
        value={formatCents(term.profitCents)}
        detail={`${margin}after ${formatCents(term.helperCreditCents)} helper credits`}
      />
      <Tile
        label="Items sold"
        value={String(term.piecesSold)}
        detail={`${term.piecesPerDay} per sale day`}
      />
      <Tile
        label="Cash over/short, net"
        value={netOverShort}
        detail={outside}
      />
    </div>
  )
}

function SalesChart({ days }: { days: InsightsSaleDay[] }) {
  const ordered = [...days].reverse()
  const max = Math.max(...ordered.map((day) => day.salesCents), 1)

  return (
    <Section title="Sales by sale day">
      <ul aria-label="Sales by sale day" className="flex h-44 items-end gap-2">
        {ordered.map((day) => (
          <li
            key={day.saleDayId}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-xs font-semibold tabular-nums">
              {formatCents(day.salesCents)}
            </span>
            <div
              className="bg-primary w-full rounded-t"
              style={{
                height: `${Math.max((day.salesCents / max) * 100, 2)}%`,
              }}
            />
            <span className="text-muted-foreground text-[11px]">
              {formatSaleDate(day.saleDate).replace(/^\w+, /, '')}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function ItemsTable({ items }: { items: InsightsItem[] }) {
  const best = Math.max(...items.map((item) => item.piecesPerDayOut), 1)

  return (
    <Section title="Items by sales per day out">
      <p className="text-muted-foreground text-xs">
        Only counts days the item was in the lineup, so items out less often
        compare fairly.
      </p>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="text-left font-medium">Item</th>
            <th className="text-right font-medium">Days out</th>
            <th className="text-right font-medium">Per day</th>
            <th className="text-right font-medium">Sales</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y tabular-nums">
          {items.map((item) => (
            <tr key={item.itemId}>
              <td className="py-2 pr-2">
                <div>{item.name}</div>
                <div className="bg-muted mt-1 h-1.5 rounded-full">
                  <div
                    className="bg-ok h-1.5 rounded-full"
                    style={{
                      width: `${(item.piecesPerDayOut / best) * 100}%`,
                    }}
                  />
                </div>
              </td>
              <td className="text-right">{item.daysOut}</td>
              <td className="text-right">{item.piecesPerDayOut}</td>
              <td className="text-right">{formatCents(item.salesCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function CashHistory({
  days,
  thresholds,
}: {
  days: InsightsSaleDay[]
  thresholds: Thresholds | undefined
}) {
  return (
    <Section title="Cash check history">
      <ul className="divide-border divide-y">
        {days.map((day) => (
          <li
            key={day.saleDayId}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="flex flex-col text-sm">
              <b>{formatSaleDate(day.saleDate)}</b>
              <span className="text-muted-foreground text-xs tabular-nums">
                {day.volunteers || 'No sign-off'} · {day.itemsOut} items out ·
                counted {formatCents(day.countedCents)}
              </span>
            </div>
            <OverShortPill cents={day.overShortCents} thresholds={thresholds} />
          </li>
        ))}
      </ul>
    </Section>
  )
}
