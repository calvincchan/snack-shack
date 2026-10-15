import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

// Reads the seeded term: five closed sale days, Sep 10 to Sep 24, counted in
// cash only (ADR-0015); five claims; Chips, Granola bar and Cheddar crackers
// counted on Sep 26 and Oct 9 (ADR-0016). Nothing here writes.
test('insights shows revenue, spending and the cash history', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Insights', exact: true }).click()

  await expect(page.getByText('This term · 5 sale days')).toBeVisible()
  await expect(page.getByText('$485.50', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('$338.14', { exact: true }).first()).toBeVisible()
  await expect(
    page.getByText('+$147.36', { exact: true }).first(),
  ).toBeVisible()
  await expect(page.getByText('$97.10', { exact: true })).toBeVisible()

  const chart = page.getByRole('list', { name: 'Revenue by sale day' })
  await expect(chart.getByRole('listitem')).toHaveCount(5)
  await expect(chart).toContainText('$112.00')

  const months = page.getByRole('table')
  await expect(months).toContainText('Sep 2026')

  // Sep 17 opened $2 short of what Sep 15 left in the box.
  await expect(
    page.getByText('Open count $2.00 less than left last time'),
  ).toBeVisible()
  await expect(page.getByText(/Gummies went first/)).toBeVisible()
  await expect(page.getByText(/Two kids asked for Pocky/)).toBeVisible()
})

test('what the numbers say and the items since the last count', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Insights', exact: true }).click()

  await expect(
    page.getByText('Revenue $18.62 above the usual $93.38.'),
  ).toBeVisible()
  await expect(page.getByText(/Granola bar moved the slowest/)).toBeVisible()
  await expect(
    page.getByText(/restocked since the last count: Mandarin fruit cups/),
  ).toBeVisible()

  const items = page.getByRole('region', {
    name: 'Items since the last stock count',
  })
  await expect(items).toContainText('Chips, assorted')
  await expect(items).toContainText('40 gone')
  await expect(items).not.toContainText('Count stock twice')
})
