import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

test('bottom tab bar navigates the five tabs', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await expect(page.getByRole('heading', { name: 'Snack Shack' })).toBeVisible()

  // Exact names: a sale day in progress also links to the Sell helper. Items
  // may carry a count, "Items (1)", when something still needs a price.
  for (const label of ['Sell', 'Buy', 'Items', 'Insights', 'Sale day']) {
    await page
      .getByRole('link', { name: new RegExp(`^${label}( \\(\\d+\\))?$`) })
      .click()
    await expect(
      page.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible()
  }
})
