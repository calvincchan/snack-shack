/**
 * Send claims to the treasurer (ADR-0017, HANDOFF §5.9).
 *
 * Called from the app with the coordinator's own session. Everything runs as
 * that user: `claims_report()` refuses anyone but the coordinator, receipt
 * photos come from the receipts bucket under their read access, and the send is
 * recorded by `record_claims_send()` for "Last sent on …".
 *
 * Body:
 *  - `{ "preview": true }` returns the email without sending it or recording it.
 *  - `{ "test": true }` sends the same email to the coordinator, not recorded.
 *  - `{}` sends to the treasurer email in Settings and records the send.
 *
 * Secrets: RESEND_API_KEY and RESEND_FROM (e.g. "Snack Shack <snacks@your.domain>").
 * SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildEmail, type Report } from '../_shared/claims-email.ts'

function base64(bytes: Uint8Array): string {
  let binary = ''
  // In chunks: spreading a whole photo into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}

/** "SS-003.jpg": the claim number, with the photo's own extension. */
function receiptFileName(label: string, path: string, type?: string): string {
  const fromPath = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  return `${label}.${fromPath ?? (type && EXTENSIONS[type]) ?? 'jpg'}`
}

// The app calls this from the browser, which sends a preflight first.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const body = await request.json().catch(() => ({}))
  const user = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: request.headers.get('Authorization') ?? '' },
      },
    },
  )

  const { data: auth } = await user.auth.getUser()
  if (!auth.user?.email) return json({ error: 'Sign in first.' }, 401)

  const { data: report, error: reportError } = await user.rpc('claims_report')
  if (reportError) {
    const notCoordinator = reportError.message.includes('Only the coordinator')
    return json({ error: reportError.message }, notCoordinator ? 403 : 500)
  }
  const facts = report as Report
  const claims = facts.to_reimburse.flatMap((buyer) => buyer.claims)

  let recipient: string
  if (body.test) {
    recipient = auth.user.email
  } else {
    const { data: settings } = await user
      .from('settings')
      .select('treasurer_email')
      .single()
    if (!settings?.treasurer_email) {
      return json({ error: 'Set the treasurer email in Settings first.' }, 400)
    }
    recipient = settings.treasurer_email
  }

  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Vancouver',
  })
  const csvName = `snack-shack-ledger-${today}.csv`

  if (body.preview) {
    const attachments = Object.fromEntries(
      claims.map((claim) => [
        claim.id,
        receiptFileName(claim.label, claim.receipt_path),
      ]),
    )
    return json({
      to: recipient,
      ...buildEmail(facts, attachments),
      attachments: [...Object.values(attachments), csvName],
    })
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return json({ error: 'RESEND_API_KEY is not set.' }, 500)

  // The photos travel with the email, so they stay readable after any link
  // would have expired. One that will not download stops the send: an email
  // with a receipt missing is worse than no email.
  const attachments: Record<string, string> = {}
  const photos: { filename: string; content: string }[] = []
  for (const claim of claims) {
    const { data: blob } = await user.storage
      .from('receipts')
      .download(claim.receipt_path)
    if (!blob) {
      return json(
        { error: `Could not read the receipt photo for ${claim.label}.` },
        502,
      )
    }
    const filename = receiptFileName(claim.label, claim.receipt_path, blob.type)
    attachments[claim.id] = filename
    photos.push({
      filename,
      content: base64(new Uint8Array(await blob.arrayBuffer())),
    })
  }

  const email = buildEmail(facts, attachments)
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:
        Deno.env.get('RESEND_FROM') ?? 'Snack Shack <onboarding@resend.dev>',
      to: [recipient],
      reply_to: auth.user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [
        {
          filename: csvName,
          content: base64(new TextEncoder().encode(email.csv)),
        },
        ...photos,
      ],
    }),
  })
  if (!sent.ok) return json({ error: `Resend said: ${await sent.text()}` }, 502)

  if (body.test) return json({ sent: true, to: recipient })

  const { error: recordError } = await user.rpc('record_claims_send', {
    p_sent_to: recipient,
    p_claim_count: claims.length,
    p_total_cents: facts.to_reimburse_cents,
  })
  return json({
    sent: true,
    to: recipient,
    ...(recordError
      ? {
          warning: `The email went out but was not recorded: ${recordError.message}`,
        }
      : {}),
  })
})
