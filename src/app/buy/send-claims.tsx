import { useState } from 'react'
import { toast } from 'sonner'
import { Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useLastSend,
  usePreviewClaimsEmail,
  useSendClaimsEmail,
  type ClaimsEmail,
} from '@/lib/claims'

/** "Oct 13", in Vancouver, from a timestamp. */
function sentOn(when: string): string {
  return new Date(when).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Vancouver',
  })
}

/**
 * Coordinator only: send every To pay claim to the treasurer before the PAC
 * meeting (ADR-0017). Preview shows the email first; the send function checks
 * the caller again.
 */
export function SendClaims({ hasClaims }: { hasClaims: boolean }) {
  const lastSend = useLastSend()
  const preview = usePreviewClaimsEmail()
  const send = useSendClaimsEmail()
  const [email, setEmail] = useState<ClaimsEmail | null>(null)

  function openPreview() {
    preview.mutate(undefined, {
      onSuccess: setEmail,
      onError: (error) => toast.error(error.message),
    })
  }

  function sendNow() {
    send.mutate(undefined, {
      onSuccess: (result) => {
        setEmail(null)
        if (result.warning) toast.warning(result.warning)
        else toast.success(`Sent to ${result.to}.`)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const last = lastSend.data

  return (
    <section
      aria-label="Send claims to treasurer"
      className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3"
    >
      <div className="flex flex-col">
        <h2 className="font-medium">Send claims to treasurer</h2>
        <p className="text-muted-foreground text-sm">
          {last
            ? `Last sent on ${sentOn(last.sent_at!)} by ${last.sent_by_name}`
            : 'Not sent yet'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="text-foreground min-h-12"
          disabled={preview.isPending}
          onClick={openPreview}
        >
          {preview.isPending ? 'Loading…' : 'Preview'}
        </Button>
        <Button
          type="button"
          className="text-primary-foreground min-h-12"
          disabled={!hasClaims || send.isPending}
          onClick={sendNow}
        >
          {send.isPending ? 'Sending…' : 'Send now'}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Send 1–2 days before the PAC meeting. Lists every To pay claim, with
        receipt photos attached.
      </p>

      {email && (
        <Dialog open onOpenChange={(next) => !next && setEmail(null)}>
          <DialogContent className="max-h-dvh overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Email preview</DialogTitle>
              <DialogDescription>
                To {email.to} · {email.subject}
              </DialogDescription>
            </DialogHeader>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={email.html}
              className="border-border h-80 w-full rounded-lg border bg-white"
            />
            <ul
              aria-label="Attachments"
              className="text-muted-foreground flex flex-wrap gap-2 text-sm"
            >
              {email.attachments.map((name) => (
                <li key={name} className="flex items-center gap-1">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  {name}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              className="text-primary-foreground min-h-12"
              disabled={!hasClaims || send.isPending}
              onClick={sendNow}
            >
              {send.isPending ? 'Sending…' : 'Send now'}
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}
