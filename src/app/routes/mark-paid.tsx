import { useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Clock, Loader2 } from 'lucide-react'
import {
  paidSummary,
  redeemMarkPaid,
  type MarkPaidResult,
} from '@/lib/mark-paid'

/**
 * The page behind "Mark [name] paid" in the treasurer's email. The treasurer
 * has no account here: opening the link redeems it once.
 */
const NO_TOKEN: MarkPaidResult = {
  status: 'invalid',
  message: 'This link is not valid.',
}

export function MarkPaidPage() {
  const [token] = useState(() =>
    new URLSearchParams(window.location.search).get('token'),
  )
  const [result, setResult] = useState<MarkPaidResult | null>(
    token ? null : NO_TOKEN,
  )
  const started = useRef(false)

  useEffect(() => {
    // Redeem once even if React runs the effect twice.
    if (!token || started.current) return
    started.current = true
    void redeemMarkPaid(token).then(setResult)
  }, [token])

  return (
    <main
      className="bg-background text-foreground mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6"
      aria-busy={result === null}
    >
      {result === null ? (
        <>
          <Loader2
            className="text-muted-foreground size-10 animate-spin"
            aria-hidden="true"
          />
          <p className="text-muted-foreground" role="status">
            Marking paid…
          </p>
        </>
      ) : result.status === 'paid' ? (
        <>
          <CircleCheck className="text-primary size-10" aria-hidden="true" />
          <h1
            className="font-heading text-2xl font-semibold"
            aria-live="polite"
          >
            {paidSummary(result.buyerName, result.count)}
          </h1>
          <p className="text-muted-foreground">
            You can close this page. Thank you.
          </p>
        </>
      ) : (
        <>
          {result.status === 'expired' ? (
            <Clock
              className="text-muted-foreground size-10"
              aria-hidden="true"
            />
          ) : (
            <CircleAlert
              className="text-muted-foreground size-10"
              aria-hidden="true"
            />
          )}
          <h1
            className="font-heading text-2xl font-semibold"
            aria-live="polite"
          >
            {result.message}
          </h1>
          {result.status === 'changed' && (
            <p className="text-muted-foreground">Nothing was marked paid.</p>
          )}
          {result.status === 'used' && (
            <p className="text-muted-foreground">
              Those receipts are already marked paid.
            </p>
          )}
        </>
      )}
    </main>
  )
}
