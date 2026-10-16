import { formatCents } from '@/lib/money'
import { formatSaleDate, formatSaleDateShort } from '@/lib/time'
import { openDiffLabel, type SaleDay } from '@/lib/sale-day'
import { formatMargin } from '@/lib/pricing'
import { itemName } from '@/lib/items'
import {
  monthLabel,
  sentences,
  signedCents,
  useInsights,
  type CountedItem,
  type Month,
  type Term,
} from '@/lib/insights'

export function InsightsPage() {
  const insights = useInsights()

  if (insights.isPending) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>
  }
  if (insights.isError) {
    return (
      <p role="alert" className="text-bad p-4 text-sm">
        Could not load Insights. Check your Wi-Fi and try again.
      </p>
    )
  }
  const { term, days, months, items, rules } = insights.data
  if (days.length === 0) {
    return (
      <div className="p-4">
        <h1 className="font-heading text-xl font-semibold">Insights</h1>
        <p className="text-muted-foreground mt-2">
          No sale days yet this term.
        </p>
      </div>
    )
  }

  const notes = days.filter((day) => day.closeNote)
  const says = sentences(rules)

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Insights</h1>
        <p className="text-muted-foreground text-sm">
          This term · {days.length}{' '}
          {days.length === 1 ? 'sale day' : 'sale days'}
        </p>
      </div>

      <Tiles term={term} />
      <RevenueChart days={days} />
      <ByMonth months={months} />
      {says.length > 0 && (
        <Section title="What the numbers say">
          <ul className="flex flex-col gap-2 text-sm">
            {says.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        </Section>
      )}
      <ItemsSinceCount items={items} />
      {notes.length > 0 && (
        <Section title="Sale day notes">
          <ul className="divide-border divide-y">
            {notes.map((day) => (
              <li key={day.id} className="py-2 text-sm">
                <b>{formatSaleDate(day.saleDate)}</b> · {day.closeNote}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <CashHistory days={days} />
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
    <section
      aria-label={title}
      className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4"
    >
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

function Tiles({ term }: { term: Term }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile
        label="Revenue"
        value={formatCents(term.revenueCents)}
        detail="from cash counts"
      />
      <Tile
        label="Spent on stock"
        value={formatCents(term.claimsCents)}
        detail="claims, after refunds"
      />
      <Tile
        label="Revenue − spending"
        value={signedCents(term.differenceCents)}
        detail="before anything else"
      />
      <Tile
        label="Average revenue"
        value={formatCents(term.revenuePerDayCents)}
        detail="per sale day"
      />
    </div>
  )
}

function RevenueChart({ days }: { days: SaleDay[] }) {
  const ordered = [...days].reverse()
  const max = Math.max(...ordered.map((day) => day.revenueCents), 1)

  return (
    <Section title="Revenue by sale day">
      <ul
        aria-label="Revenue by sale day"
        className="flex h-44 items-end gap-2"
      >
        {ordered.map((day) => (
          <li
            key={day.id}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-xs font-semibold tabular-nums">
              {formatCents(day.revenueCents)}
            </span>
            <div
              className="bg-primary w-full rounded-t"
              style={{
                height: `${Math.max((day.revenueCents / max) * 100, 2)}%`,
              }}
            />
            <span className="text-muted-foreground text-[11px]">
              {formatSaleDateShort(day.saleDate)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function ByMonth({ months }: { months: Month[] }) {
  return (
    <Section title="By month">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-1 text-left font-medium">Month</th>
            <th className="py-1 text-right font-medium">Revenue</th>
            <th className="py-1 text-right font-medium">Claims</th>
            <th className="py-1 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {months.map((month) => (
            <tr key={month.month}>
              <td className="py-2">{monthLabel(month.month)}</td>
              <td className="py-2 text-right">
                {formatCents(month.revenueCents)}
              </td>
              <td className="py-2 text-right">
                {formatCents(month.claimsCents)}
              </td>
              <td className="py-2 text-right font-semibold">
                {signedCents(month.differenceCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function ItemsSinceCount({ items }: { items: CountedItem[] }) {
  return (
    <Section title="Items since the last stock count">
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Count stock twice to see what sells.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <b>{itemName(item)}</b>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {item.piecesGone} gone
                  {item.revenueEstimateCents !== null &&
                    ` · about ${formatCents(item.revenueEstimateCents)}`}
                </span>
              </div>
              <span className="text-muted-foreground text-xs tabular-nums">
                {item.margin === null
                  ? 'Needs a price'
                  : `${formatMargin(item.margin)} margin`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">
        An estimate: it can't tell sold from lost, and uses today's prices.
      </p>
    </Section>
  )
}

function CashHistory({ days }: { days: SaleDay[] }) {
  return (
    <Section title="Cash history">
      <ul className="divide-border divide-y">
        {days.map((day) => {
          const diff = openDiffLabel(day.openDiffCents, formatCents)
          return (
            <li
              key={day.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="flex flex-col text-sm">
                <b>{formatSaleDate(day.saleDate)}</b>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {day.closedBy ?? 'Closed'} · open {formatCents(day.openCents)}{' '}
                  · close {formatCents(day.closeCents)}
                </span>
                {diff && (
                  <span className="text-warn text-xs">Open count {diff}</span>
                )}
              </div>
              <div className="flex flex-col items-end text-sm tabular-nums">
                <b>{formatCents(day.revenueCents)}</b>
                <span className="text-muted-foreground text-xs">
                  deposit {formatCents(day.depositCents ?? 0)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
