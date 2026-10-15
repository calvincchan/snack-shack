import { formatCents } from '@/lib/money'
import { formatSaleDate, formatSaleDateShort } from '@/lib/time'
import { openDiffLabel, type SaleDay } from '@/lib/sale-day'
import { useClosedSaleDays } from '@/lib/insights'

export function InsightsPage() {
  const days = useClosedSaleDays()

  if (days.isPending) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>
  }
  if (days.isError) {
    return (
      <p role="alert" className="text-bad p-4 text-sm">
        Could not load Insights. Check your Wi-Fi and try again.
      </p>
    )
  }
  if (days.data.length === 0) {
    return (
      <div className="p-4">
        <h1 className="font-heading text-xl font-semibold">Insights</h1>
        <p className="text-muted-foreground mt-2">
          No sale days yet this term.
        </p>
      </div>
    )
  }

  const notes = days.data.filter((day) => day.closeNote)

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Insights</h1>
        <p className="text-muted-foreground text-sm">
          This term · {days.data.length}{' '}
          {days.data.length === 1 ? 'sale day' : 'sale days'}
        </p>
      </div>

      <Tiles days={days.data} />
      <RevenueChart days={days.data} />
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
      <CashHistory days={days.data} />
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

function Tiles({ days }: { days: SaleDay[] }) {
  const revenue = days.reduce((sum, day) => sum + day.revenueCents, 0)
  const deposits = days.reduce((sum, day) => sum + (day.depositCents ?? 0), 0)

  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile
        label="Revenue"
        value={formatCents(revenue)}
        detail={`${formatCents(Math.round(revenue / days.length))} per sale day`}
      />
      <Tile
        label="Deposited"
        value={formatCents(deposits)}
        detail="sealed in deposit bags"
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
