import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

test.describe.configure({ mode: 'serial' })

// The seed logs five receipts: SS-001 and SS-002 are already reimbursed,
// SS-003 to SS-005 are still owed (see supabase/seed.sql).
test('claims are grouped by volunteer, with totals and receipt links', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()
  await page.getByRole('tab', { name: 'Claims' }).click()

  await expect(page.getByText('Owed to volunteers')).toBeVisible()
  await expect(page.getByText('Reimbursed this term')).toBeVisible()

  // Yuki bought SS-003 ($42.72) and SS-004 ($34.67).
  const yuki = page.getByRole('list', { name: 'Claims to pay Yuki' })
  await expect(yuki.getByRole('listitem')).toHaveCount(2)
  await expect(yuki).toContainText('SS-003')
  await expect(yuki).toContainText('SS-004')

  const calvin = page.getByRole('list', { name: 'Claims to pay Calvin' })
  await expect(calvin.getByRole('listitem')).toHaveCount(1)
  await expect(calvin).toContainText('SS-005')

  // Paid claims carry the reference the treasurer used.
  const paid = page.getByRole('list', { name: 'Paid claims' })
  await expect(paid).toContainText('SS-001')
  await expect(paid).toContainText('SS-002')
  await expect(paid).toContainText('E-transfer')
})

test('tapping a claim shows its lines and status, tapping again hides them', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()
  await page.getByRole('tab', { name: 'Claims' }).click()

  const toPay = page.getByRole('button', { name: /SS-003/ })
  await toPay.click()
  await expect(toPay).toHaveAttribute('aria-expanded', 'true')
  const lines = page.getByRole('list', { name: 'Lines on SS-003' })
  await expect(lines.getByRole('listitem').first()).toContainText('×')
  await expect(page.getByText('TO PAY', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Photo' })).toBeVisible()

  await toPay.click()
  await expect(lines).toHaveCount(0)

  await page.getByRole('button', { name: /SS-001/ }).click()
  await expect(page.getByText(/PAID 2026-.*E-transfer/)).toBeVisible()
})

test('the CSV ledger can be downloaded', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()
  await page.getByRole('tab', { name: 'Claims' }).click()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  const file = await download

  expect(file.suggestedFilename()).toBe('snack-shack-claims.csv')

  const stream = await file.createReadStream()
  const csv = (await stream.toArray()).join('')
  expect(csv.split('\n')[0]).toBe(
    'Claim,Date,Store,Volunteer,Total,Status,Paid on,Reference',
  )
  expect(csv).toContain('SS-001,2026-09-08,Costco,Calvin,')
  expect(csv).toContain('E-transfer')
})
