import { toast } from 'sonner'
import { Copy, Download, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  claimsCsv,
  groupByBuyer,
  receiptUrl,
  useClaims,
  type Claim,
} from '@/lib/claims'
import { formatCents } from '@/lib/money'
import { useSearchParams } from 'react-router'
import { ClaimsPrototype } from '@/app/buy/claims.prototype'

export function Claims() {
  const claims = useClaims()
  // PROTOTYPE: ?variant=A|B|C swaps in the claim detail + refund prototype.
  const [params] = useSearchParams()
  const variant = params.get('variant')
  if (import.meta.env.DEV && variant)
    return <ClaimsPrototype variant={variant} />

  const all = claims.data ?? []
  const toPay = all.filter((claim) => claim.status === 'to_pay')
  const paid = all.filter((claim) => claim.status === 'paid')

  const owedCents = toPay.reduce((sum, claim) => sum + claim.totalCents, 0)
  const paidCents = paid.reduce((sum, claim) => sum + claim.totalCents, 0)

  async function copyLedger() {
    try {
      await navigator.clipboard.writeText(claimsCsv(all))
      toast.success('CSV ledger copied.')
    } catch {
      toast.error('Could not copy. Use Download instead.')
    }
  }

  function downloadLedger() {
    const blob = new Blob([claimsCsv(all)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'snack-shack-claims.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-6">
      {claims.isPending && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Total label="Owed to volunteers" cents={owedCents} />
        <Total label="Reimbursed this term" cents={paidCents} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">To pay</h2>
        {toPay.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Everyone has been paid back.
          </p>
        ) : (
          groupByBuyer(toPay).map((group) => (
            <div
              key={group.buyerId}
              className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3"
            >
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{group.buyerName}</span>
                <span className="font-heading text-lg font-semibold tabular-nums">
                  {formatCents(group.totalCents)}
                </span>
              </p>
              <ul
                aria-label={`Claims to pay ${group.buyerName}`}
                className="flex flex-col gap-1"
              >
                {group.claims.map((claim) => (
                  <li key={claim.id}>
                    <ClaimLine claim={claim} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Paid</h2>
        {paid.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing reimbursed yet this term.
          </p>
        ) : (
          <ul
            aria-label="Paid claims"
            className="border-border bg-card divide-border divide-y rounded-xl border"
          >
            {paid.map((claim) => (
              <li key={claim.id} className="flex flex-col gap-1 p-3">
                <ClaimLine claim={claim} />
                <p className="text-muted-foreground text-sm">
                  {claim.buyerName} · {claim.paymentRef ?? 'Paid'}
                  {claim.paidAt && ` · ${claim.paidAt.slice(0, 10)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="text-foreground min-h-12 flex-1"
          onClick={() => void copyLedger()}
        >
          <Copy className="size-4" aria-hidden="true" />
          Copy CSV ledger
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-foreground min-h-12 flex-1"
          onClick={downloadLedger}
        >
          <Download className="size-4" aria-hidden="true" />
          Download
        </Button>
      </div>
    </div>
  )
}

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="border-border bg-card flex flex-col gap-1 rounded-xl border p-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-heading text-xl font-semibold tabular-nums">
        {formatCents(cents)}
      </span>
    </div>
  )
}

function ClaimLine({ claim }: { claim: Claim }) {
  function openReceipt() {
    // The tab has to be opened inside the tap, before the signed URL is
    // fetched, or the browser treats it as a pop-up and blocks it. `noopener`
    // is not an option here: it makes window.open return null.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null

    receiptUrl(claim.receiptPath)
      .then((url) => {
        if (tab) tab.location.href = url
        else window.location.href = url
      })
      .catch(() => {
        tab?.close()
        toast.error('Could not open that receipt.')
      })
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <button
        type="button"
        onClick={openReceipt}
        className="text-foreground flex min-h-11 items-center gap-2 underline underline-offset-4"
      >
        <Receipt className="size-4" aria-hidden="true" />
        {claim.label}
        <span className="text-muted-foreground">
          {claim.store} · {claim.purchasedOn}
        </span>
      </button>
      <span className="tabular-nums">{formatCents(claim.totalCents)}</span>
    </div>
  )
}
