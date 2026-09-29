import { expect, test, type Page } from '@playwright/test'

// The e2e stack has no Edge Runtime, so the redeem function is stubbed here.
// The function and the database rules behind it are tested on their own
// (supabase/tests/redeem_mark_paid.test.sql).
async function answer(page: Page, body: object) {
  await page.route('**/functions/v1/redeem-mark-paid', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    }),
  )
}

test('the email link shows how many receipts were marked paid', async ({
  page,
}) => {
  await answer(page, { status: 'paid', buyer_name: 'Yuki', purchases_paid: 2 })
  await page.goto('/mark-paid?token=abc')
  await expect(
    page.getByRole('heading', { name: "Yuki's 2 receipts marked paid" }),
  ).toBeVisible()
})

test('a second tap says the link was already used', async ({ page }) => {
  await answer(page, {
    status: 'used',
    message: 'This link has already been used.',
  })
  await page.goto('/mark-paid?token=abc')
  await expect(
    page.getByRole('heading', { name: 'This link has already been used.' }),
  ).toBeVisible()
})

test('an old link explains it expired', async ({ page }) => {
  await answer(page, {
    status: 'expired',
    message: 'This link has expired. Use the latest weekly email.',
  })
  await page.goto('/mark-paid?token=abc')
  await expect(
    page.getByRole('heading', { name: /This link has expired/ }),
  ).toBeVisible()
})

test('a link with no token is not valid', async ({ page }) => {
  await page.goto('/mark-paid')
  await expect(
    page.getByRole('heading', { name: 'This link is not valid.' }),
  ).toBeVisible()
})
