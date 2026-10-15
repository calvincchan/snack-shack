import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

// Reads the seeded term: five closed sale days, Sep 10 to Sep 24, counted
// in cash only (ADR-0015). Nothing here writes.
test('insights shows revenue and the cash history', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Insights', exact: true }).click()

  await expect(page.getByText('This term · 5 sale days')).toBeVisible()
  await expect(page.getByText('$485.50', { exact: true })).toBeVisible()
  await expect(page.getByText('$97.10 per sale day')).toBeVisible()
  await expect(page.getByText('$483.50', { exact: true })).toBeVisible()

  const chart = page.getByRole('list', { name: 'Revenue by sale day' })
  await expect(chart.getByRole('listitem')).toHaveCount(5)
  await expect(chart).toContainText('$112.00')

  // Sep 17 opened $2 short of what Sep 15 left in the box.
  await expect(
    page.getByText('Open count $2.00 less than left last time'),
  ).toBeVisible()
  await expect(page.getByText(/Gummies went first/)).toBeVisible()
  await expect(page.getByText(/Two kids asked for Pocky/)).toBeVisible()
})
