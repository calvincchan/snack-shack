import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

test('bottom tab bar navigates the four tabs', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await expect(page.getByRole('heading', { name: 'Snack Shack' })).toBeVisible()

  // Items may carry a count, "Items (1)", when something still needs a price.
  for (const label of ['Buy', 'Items', 'Insights', 'Sale day']) {
    await page
      .getByRole('link', { name: new RegExp(`^${label}( \\(\\d+\\))?$`) })
      .click()
    await expect(
      page.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible()
  }
})
