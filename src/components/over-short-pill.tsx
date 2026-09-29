import { cn } from 'cn'
import {
  overShortLabel,
  overShortStatus,
  type OverShort,
  type Thresholds,
} from '@/lib/count-up'

const PILL: Record<OverShort, string> = {
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
}

export function OverShortPill({
  cents,
  thresholds,
}: {
  cents: number
  thresholds: Thresholds | undefined
}) {
  const status = thresholds
    ? overShortStatus(cents, thresholds.okCents, thresholds.warnCents)
    : 'ok'
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-sm font-semibold tabular-nums',
        PILL[status],
      )}
    >
      {overShortLabel(cents)}
    </span>
  )
}
