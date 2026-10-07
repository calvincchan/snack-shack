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
import {
  suggestRefundCents,
  useAddRefund,
  type Claim,
  type ReceiptLine,
} from '@/lib/claims'
import {
  centsToDollarString,
  dollarStringToCents,
  formatCents,
} from '@/lib/money'
import { todayDate } from '@/lib/time'

/** Prefilled with everything left on the line; the slip has the final word. */
function prefill(line: ReceiptLine) {
  return {
    pieces: String(line.piecesLeft),
    amount: centsToDollarString(line.centsLeft),
  }
}

/**
 * Log a refund on a To pay claim (ADR-0013). The pieces and amount start as
 * everything left on the line. Changing the pieces reworks the amount as a
 * share of what is left, until the volunteer types an amount of their own.
 * `refund_purchase_line()` checks every rule and its messages show as-is.
 */
export function RefundDialog({
  claim,
  onClose,
}: {
  claim: Claim
  onClose: () => void
}) {
  const open = claim.lines.filter((line) => line.piecesLeft > 0)
  const first = open[0]

  // Generated once per dialog, so a retry after a dropped connection is safe.
  const [refundId] = useState(() => crypto.randomUUID())
  const [lineId, setLineId] = useState(first?.id ?? '')
  const [pieces, setPieces] = useState(first ? prefill(first).pieces : '')
  const [amount, setAmount] = useState(first ? prefill(first).amount : '')
  const [amountEdited, setAmountEdited] = useState(false)
  const [refundedOn, setRefundedOn] = useState(() => todayDate())
  const [note, setNote] = useState('')
  const [slip, setSlip] = useState<File | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const add = useAddRefund()

  const line = claim.lines.find((l) => l.id === lineId)

  function pickLine(id: string) {
    setLineId(id)
    const next = claim.lines.find((l) => l.id === id)
    if (!next) return
    setPieces(prefill(next).pieces)
    setAmount(prefill(next).amount)
    setAmountEdited(false)
  }

  function changePieces(value: string) {
    setPieces(value)
    const count = Number(value)
    if (!line || amountEdited || !Number.isInteger(count) || count < 1) return
    setAmount(centsToDollarString(suggestRefundCents(line, count)))
  }

  function save() {
    if (!line) return
    setProblem(null)
    add.mutate(
      {
        id: refundId,
        lineId: line.id,
        pieces: Number(pieces),
        amountCents: dollarStringToCents(amount),
        refundedOn,
        note,
        slip,
      },
      {
        onSuccess: () => {
          toast.success('Refund saved. Pieces out of stock.')
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
          <DialogTitle>Refund on {claim.label}</DialogTitle>
          <DialogDescription>
            Enter what the refund slip says.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <Label htmlFor="refund-line">Item</Label>
          <select
            id="refund-line"
            value={lineId}
            onChange={(event) => pickLine(event.target.value)}
            className="border-input bg-background text-foreground min-h-11 rounded-md border px-2"
          >
            {open.map((l) => (
              <option key={l.id} value={l.id}>
                {l.item} ({l.piecesLeft} left, {formatCents(l.centsLeft)})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="refund-pieces">Pieces returned</Label>
            <Input
              id="refund-pieces"
              inputMode="numeric"
              className="min-h-11 tabular-nums"
              value={pieces}
              onChange={(event) => changePieces(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="refund-amount">Refund amount</Label>
            <Input
              id="refund-amount"
              inputMode="decimal"
              className="min-h-11 tabular-nums"
              placeholder="$0.00"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                setAmountEdited(true)
              }}
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-1 text-xs">
          Worked out from the receipt, tax included. Check it against the refund
          slip.
        </p>

        <div className="flex flex-col gap-1">
          <Label htmlFor="refund-date">Refunded on</Label>
          <Input
            id="refund-date"
            type="date"
            className="min-h-11"
            value={refundedOn}
            onChange={(event) => setRefundedOn(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="refund-note">Note (optional)</Label>
          <Input
            id="refund-note"
            className="min-h-11"
            placeholder="Box was crushed"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="refund-slip">Refund slip photo (optional)</Label>
          <Input
            id="refund-slip"
            type="file"
            accept="image/*"
            capture="environment"
            className="min-h-12"
            onChange={(event) => setSlip(event.target.files?.[0] ?? null)}
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
          disabled={add.isPending || !line}
          onClick={save}
        >
          {add.isPending ? 'Saving…' : 'Save refund'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
