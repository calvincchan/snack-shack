/**
 * Redeem a one-time Mark paid link (ADR-0007, HANDOFF §5.9).
 *
 * The treasurer never signs in, so the /mark-paid page calls this with only
 * the token from the email: `{ "token": "..." }`. The database checks the
 * token, marks the volunteer's claims paid as the treasurer and burns the link.
 * Answers `{ status: "paid", buyer_name, purchases_paid }`, or
 * `{ status: "invalid" | "used" | "expired", message }`.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const failures: Record<string, string> = {
  SS001: 'invalid',
  SS002: 'used',
  SS003: 'expired',
}

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

  const { token } = await request.json().catch(() => ({}))
  if (typeof token !== 'string' || token.length === 0) {
    return json({ status: 'invalid', message: 'This link is not valid.' })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data, error } = await admin.rpc('redeem_action_token', {
    p_token: token,
  })
  if (error) {
    const status = failures[error.code]
    if (status) return json({ status, message: error.message })
    return json({ error: 'Something went wrong. Try the link again.' }, 500)
  }
  return json({
    status: 'paid',
    buyer_name: data.buyer_name,
    purchases_paid: data.purchases_paid,
  })
})
