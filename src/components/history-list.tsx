import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from 'cn'
import { formatWhen, useHistory, type HistoryScope } from '@/lib/history'

/**
 * "History" on a sheet: closed until asked for, so the query only runs for
 * someone who wants it. Each line reads "BBQ chips count changed 14 → 12"
 * with who and when under it.
 */
export function HistoryList({ scope }: { scope: HistoryScope }) {
  const [open, setOpen] = useState(false)
  const history = useHistory(scope, open)

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-muted-foreground flex min-h-11 items-center justify-between text-xs font-semibold tracking-wide uppercase"
      >
        History
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && history.isPending && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}
      {open && history.isError && (
        <p role="alert" className="text-sm">
          {history.error?.message}
        </p>
      )}
      {open && history.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">No changes yet.</p>
      )}
      {open && !!history.data?.length && (
        <ul className="flex flex-col gap-3">
          {history.data.map((entry) => (
            <li key={entry.key} className="flex flex-col text-sm">
              <span>{entry.text}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {entry.who} · {formatWhen(entry.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
