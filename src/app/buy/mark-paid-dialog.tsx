import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMarkClaimsPaid, type Claim } from '@/lib/claims'
import { formatCents } from '@/lib/money'
import { todayDate } from '@/lib/time'

/**
 * Mark one volunteer's claims, or a single claim, paid once the cheque is
 * handed out (ADR-0017). `mark_claims_paid()` checks the claims are still To
 * pay and the total is what was loaded, and its messages show as-is.
 */
export function MarkPaidDialog({
  claims,
  who,
  onClose,
}: {
  claims: Claim[]
  /** The volunteer's display name, for the title. */
  who: string
  onClose: () => void
}) {
  const [paidOn, setPaidOn] = useState(() => todayDate())
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const markPaid = useMarkClaimsPaid()

  const totalCents = claims.reduce((sum, claim) => sum + claim.netCents, 0)

  function save() {
    setProblem(null)
    markPaid.mutate(
      { claims, paidOn, note },
      {
        onSuccess: () => {
          toast.success(`Marked ${claims.map((c) => c.label).join(', ')} paid.`)
          onClose()
        },
        onError: (error) => setProblem(error.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {who} paid</DialogTitle>
          <DialogDescription>
            {claims.map((claim) => claim.label).join(', ')} ·{' '}
            <span className="tabular-nums">{formatCents(totalCents)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <Label htmlFor="paid-on">Paid on</Label>
          <Input
            id="paid-on"
            type="date"
            className="min-h-11"
            max={todayDate()}
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="paid-note">Note (optional)</Label>
          <Input
            id="paid-note"
            className="min-h-11"
            placeholder="Cheque #142"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {problem && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}

        <Button
          type="button"
          className="text-primary-foreground min-h-12"
          disabled={markPaid.isPending || !paidOn}
          onClick={save}
        >
          {markPaid.isPending ? 'Saving…' : 'Mark paid'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
