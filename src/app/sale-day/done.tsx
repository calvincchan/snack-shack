import { Button } from '@/components/ui/button'
import { formatCents } from '@/lib/money'
import { useTotals } from '@/lib/count-up'

/** After Finish: the one number the volunteers need (HANDOFF §4.1). */
export function Done({
  saleDayId,
  onClose,
}: {
  saleDayId: string
  onClose: () => void
}) {
  const totals = useTotals(saleDayId)

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Done
        </p>
        <h1 className="font-heading text-2xl font-semibold">
          {totals.data
            ? `Seal ${formatCents(totals.data.depositCents)} in the deposit bag`
            : 'Count up finished'}
        </h1>
        <p className="text-muted-foreground text-sm">
          Write the date and your name on the bag. Leave the change float in the
          box.
        </p>
      </section>

      <Button
        type="button"
        className="text-primary-foreground min-h-12"
        onClick={onClose}
      >
        Back to sale day
      </Button>
    </div>
  )
}
