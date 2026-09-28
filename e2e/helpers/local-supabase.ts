import { expect, type Page } from '@playwright/test'

/**
 * The keys a local `supabase start` always prints. They are the same on every
 * machine and never reach production, so keeping them here beats a setup step.
 */
export const LOCAL_API_URL = 'http://127.0.0.1:54321'
export const LOCAL_MAILPIT_URL = 'http://127.0.0.1:54324'
export const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

/** Create an auth user without going through the email, for test setup. */
export async function createAuthUser(email: string) {
  const response = await fetch(`${LOCAL_API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, email_confirm: true }),
  })
  if (!response.ok) {
    throw new Error(
      `Could not create ${email}: ${response.status} ${await response.text()}`,
    )
  }
}

export async function clearMailbox() {
  await fetch(`${LOCAL_MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
}

type MailpitSummary = { ID: string }

/** Poll Mailpit for the newest magic link sent to this address. */
async function magicLinkFor(
  email: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const search = await fetch(
      `${LOCAL_MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`,
    )
    const { messages } = (await search.json()) as { messages: MailpitSummary[] }
    if (messages.length > 0) {
      const message = await fetch(
        `${LOCAL_MAILPIT_URL}/api/v1/message/${messages[0].ID}`,
      )
      const { Text, HTML } = (await message.json()) as {
        Text: string
        HTML: string
      }
      const link = `${Text}\n${HTML}`.match(
        /https?:\/\/[^\s"'<>]*\/auth\/v1\/verify[^\s"'<>]*/,
      )
      if (link) return link[0].replaceAll('&amp;', '&')
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No magic link arrived for ${email}`)
}

/** The real thing a volunteer does: type an email, then open the link. */
export async function signIn(page: Page, email: string) {
  await clearMailbox()
  await page.goto('/')
  await page.getByLabel('Email').fill(email)

  const sent = page.getByRole('heading', { name: 'Check your email' })
  const send = page.getByRole('button', { name: 'Send me a link' })

  // Supabase throttles repeated links to the same address, and a test run asks
  // for several. Wait out the throttle rather than failing the test.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await sent.isVisible()) break
    await send.click()
    if (await sent.isVisible({ timeout: 5000 }).catch(() => false)) break
    await page.waitForTimeout(2000)
  }
  await expect(sent).toBeVisible()

  // Opening the link in the same context matters: PKCE keeps the verifier here.
  await page.goto(await magicLinkFor(email))

  // The code in the URL is exchanged for a session after the page loads. Wait
  // for it to land in storage, or the next navigation cancels the exchange.
  await page.waitForFunction(() =>
    Object.keys(window.localStorage).some(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token'),
    ),
  )
}
