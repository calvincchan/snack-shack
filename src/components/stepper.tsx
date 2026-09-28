import { Minus, Plus } from 'lucide-react'
import { cn } from 'cn'

/**
 * − / number / + with 44 px buttons, for counting pieces one-handed at the
 * table (HANDOFF §7). The number itself is an input, so a volunteer who is 30
 * pieces out can type instead of tapping.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  className,
}: {
  /** What is being counted, for screen readers: "Cheddar crackers". */
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  className?: string
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  return (
    <div
      className={cn(
        'border-border bg-muted flex shrink-0 items-center rounded-lg border',
        className,
      )}
    >
      <button
        type="button"
        aria-label={`One fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="text-foreground flex size-11 items-center justify-center rounded-l-lg disabled:opacity-40"
      >
        <Minus className="size-5" aria-hidden="true" />
      </button>

      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '')
          onChange(digits === '' ? min : clamp(Number(digits)))
        }}
        className="bg-card text-foreground font-heading h-11 w-14 border-x-0 text-center text-lg font-semibold tabular-nums outline-none"
      />

      <button
        type="button"
        aria-label={`One more ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="text-foreground flex size-11 items-center justify-center rounded-r-lg disabled:opacity-40"
      >
        <Plus className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}
