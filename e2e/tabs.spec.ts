import { expect, test } from '@playwright/test'

test('bottom tab bar navigates the five tabs', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Snack Shack' })).toBeVisible()

  for (const label of ['Sell', 'Buy', 'Items', 'Insights', 'Sale day']) {
    await page.getByRole('link', { name: label }).click()
    await expect(page.getByRole('heading', { name: label })).toBeVisible()
  }
})
