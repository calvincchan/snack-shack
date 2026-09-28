import { cn } from 'cn'
import type { Enums } from '@/lib/database.types'
import type { MarginBand } from '@/lib/pricing'

/** Treats have a red dot, snacks a green one, everywhere an item appears. */
export function TypeDot({
  type,
  className,
}: {
  type: Enums<'item_type'>
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={type === 'treat' ? 'Treat' : 'Snack'}
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        type === 'treat' ? 'bg-treat' : 'bg-snack',
        className,
      )}
    />
  )
}

const bandTone = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
} as const

export function BandPill({
  band,
  className,
}: {
  band: MarginBand
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        bandTone[band.tone],
        className,
      )}
    >
      <span
        className="inline-block size-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
      {band.label}
    </span>
  )
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
      {children}
    </span>
  )
}
