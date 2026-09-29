import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

// Reads the seeded sale day (Sep 24): $114.00 of sales, one $1 helper credit,
// counted $142.00 against $143.00 expected. Nothing here writes.
test('insights shows the term from the views', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Insights', exact: true }).click()

  await expect(page.getByText('This term · 1 sale day')).toBeVisible()
  await expect(page.getByText('$114.00 per sale day')).toBeVisible()
  await expect(page.getByText('$66.74')).toBeVisible()
  await expect(
    page.getByText('59% margin, after $1.00 helper credits'),
  ).toBeVisible()
  await expect(page.getByText('106', { exact: true })).toBeVisible()
  await expect(page.getByText('−$1.00')).toBeVisible()
  await expect(page.getByText('0 sales over ±$3')).toBeVisible()

  await expect(
    page.getByRole('list', { name: 'Sales by sale day' }),
  ).toContainText('$114.00')

  const items = page.getByRole('table')
  await expect(items.getByRole('row').nth(1)).toContainText('Fruit gummies')
  await expect(items.getByRole('row').nth(1)).toContainText('$40.00')

  await expect(
    page.getByText('Calvin, Yuki · 5 items out · counted $142.00'),
  ).toBeVisible()
  await expect(page.getByText('Short $1.00')).toBeVisible()
  await expect(page.getByText(/Gummies went first/)).toBeVisible()
})
