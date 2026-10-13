/**
 * Weekly treasurer email (ADR-0007, HANDOFF §5.9).
 *
 * Two callers:
 *  - pg_cron, with the service role key and `{ "scheduled": true }`. It fires at
 *    14:00 and 15:00 UTC on Mondays and this function sends only when it is
 *    07:00 in Vancouver, so daylight saving needs no second schedule.
 *  - the coordinator's "Send a test email to me" button, with their own session
 *    and `{ "test": true }`. It sends the same email to them.
 *
 * Secrets: RESEND_API_KEY, RESEND_FROM (e.g. "Snack Shack <snacks@your.domain>"),
 * APP_URL (where the Mark paid page lives). SUPABASE_URL, SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 * Add `{ "dryRun": true }` to get the email back without sending it.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildEmail, type Report } from '../_shared/weekly-email.ts'

const SEVEN_DAYS = 7 * 24 * 60 * 60

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
function receiptFileName(label: string, path: string, type: string): string {
  const fromPath = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  return `${label}.${fromPath ?? EXTENSIONS[type] ?? 'jpg'}`
}

// The test button calls this from the browser, which sends a preflight first.
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

function vancouverHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'America/Vancouver',
    }).format(now),
  )
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const body = await request.json().catch(() => ({}))
  const authorization = request.headers.get('Authorization') ?? ''
  const admin = createClient(url, serviceKey)

  // Who is asking, and where does the email go?
  let recipient: string
  if (body.test) {
    const user = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: auth } = await user.auth.getUser()
    if (!auth.user?.email) return json({ error: 'Sign in first.' }, 401)
    const { data: profile } = await admin
      .from('profiles')
      .select('role, active')
      .eq('id', auth.user.id)
      .maybeSingle()
    if (!profile?.active || profile.role !== 'admin') {
      return json({ error: 'Only the coordinator can send a test email.' }, 403)
    }
    recipient = auth.user.email
  } else {
    if (authorization !== `Bearer ${serviceKey}`) {
      return json({ error: 'Not allowed.' }, 401)
    }
    if (!body.force && vancouverHour(new Date()) !== 7) {
      return json({ skipped: 'It is not 07:00 in Vancouver.' })
    }
    const { data: settings } = await admin
      .from('settings')
      .select('treasurer_email')
      .single()
    if (!settings?.treasurer_email) {
      return json({ error: 'Set the treasurer email in Settings first.' }, 400)
    }
    recipient = settings.treasurer_email
  }

  // Check the setup before issuing anything, so a misconfigured send burns no links.
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!body.dryRun && !apiKey) {
    return json({ error: 'RESEND_API_KEY is not set.' }, 500)
  }
  const appUrl = (
    Deno.env.get('APP_URL') ??
    (url.includes('127.0.0.1') || url.includes('localhost')
      ? 'http://localhost:5173'
      : '')
  ).replace(/\/$/, '')
  if (!appUrl) return json({ error: 'APP_URL is not set.' }, 500)

  const { data: report, error: reportError } = await admin.rpc(
    'weekly_treasurer_report',
  )
  if (reportError) return json({ error: reportError.message }, 500)
  const facts = report as Report

  // One-time Mark paid link per volunteer, issued to the treasurer account.
  const { data: tokens, error: tokenError } = await admin.rpc(
    'issue_mark_paid_tokens',
  )
  if (tokenError) return json({ error: tokenError.message }, 500)
  const markPaid: Record<string, string> = {}
  for (const row of tokens as { buyer_id: string; token: string }[]) {
    markPaid[row.buyer_id] = `${appUrl}/mark-paid?token=${row.token}`
  }

  // Receipt photos live in a private bucket. The links last as long as the
  // Mark paid buttons (7 days) because the treasurer works through the email
  // over the week.
  const claims = facts.to_reimburse.flatMap((buyer) => buyer.claims)
  const receipts: Record<string, string> = {}
  if (claims.length > 0) {
    const { data: signed } = await admin.storage
      .from('receipts')
      .createSignedUrls(
        claims.map((claim) => claim.receipt_path),
        SEVEN_DAYS,
      )
    for (const entry of signed ?? []) {
      const claim = claims.find((c) => c.receipt_path === entry.path)
      if (claim && entry.signedUrl) receipts[claim.id] = entry.signedUrl
    }
  }

  // The photos travel with the email too, so it stays a record after the
  // links expire. A photo that will not download still has its link.
  const attachments: Record<string, string> = {}
  const photos: { filename: string; content: string }[] = []
  for (const claim of claims) {
    const { data: blob } = await admin.storage
      .from('receipts')
      .download(claim.receipt_path)
    if (!blob) continue
    const filename = receiptFileName(claim.label, claim.receipt_path, blob.type)
    attachments[claim.id] = filename
    photos.push({
      filename,
      content: base64(new Uint8Array(await blob.arrayBuffer())),
    })
  }

  const email = buildEmail(facts, { markPaid, receipts, attachments })
  if (body.dryRun) {
    return json({
      to: recipient,
      ...email,
      attachments: photos.map((photo) => photo.filename),
    })
  }

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
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [
        {
          filename: `snack-shack-ledger-${facts.week_start}.csv`,
          content: base64(new TextEncoder().encode(email.csv)),
        },
        ...photos,
      ],
    }),
  })
  if (!sent.ok) return json({ error: `Resend said: ${await sent.text()}` }, 502)
  return json({ sent: true, to: recipient, subject: email.subject })
})
