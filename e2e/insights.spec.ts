import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

// Reads the seeded term: five closed sale days, Sep 10 to Sep 24. Nothing here
// writes. Every figure comes from an `insights_*` view.
test('insights shows the term from the views', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Insights', exact: true }).click()

  await expect(page.getByText('This term · 5 sale days')).toBeVisible()
  await expect(page.getByText('$585.00', { exact: true })).toBeVisible()
  await expect(page.getByText('$117.00 per sale day')).toBeVisible()
  await expect(page.getByText('$348.16', { exact: true })).toBeVisible()
  await expect(
    page.getByText('60% margin, after $5.00 helper credits'),
  ).toBeVisible()
  await expect(page.getByText('552', { exact: true })).toBeVisible()
  await expect(page.getByText('−$4.00')).toBeVisible()
  await expect(page.getByText('1 sale over ±$3')).toBeVisible()

  const chart = page.getByRole('list', { name: 'Sales by sale day' })
  await expect(chart.getByRole('listitem')).toHaveCount(5)
  await expect(chart).toContainText('$114.00')

  const items = page.getByRole('table')
  await expect(items.getByRole('row').nth(1)).toContainText('Fruit gummies')
  await expect(items.getByRole('row').nth(1)).toContainText('$185.00')

  await expect(
    page.getByText('Calvin, Yuki · 5 items out · counted $142.00'),
  ).toBeVisible()
  await expect(page.getByText('Short $1.00').first()).toBeVisible()
  await expect(page.getByText('Over $2.00')).toBeVisible()
  await expect(page.getByText(/Gummies went first/)).toBeVisible()
  await expect(page.getByText(/Two kids asked for Pocky/)).toBeVisible()
})

test('what the numbers say shows a sentence for each rule that applies', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Insights', exact: true }).click()

  const says = page
    .getByRole('heading', { name: 'What the numbers say' })
    .locator('..')
  await expect(says).toContainText(
    'Fruit popsicle sales are fading. 27 sold on Sep 10, 22 on Sep 22.',
  )
  await expect(says).toContainText(
    'Chips, assorted sold out 1 of the 5 days it was out.',
  )
  await expect(says).toContainText(
    'Fruit gummies sold out 3 of the 5 days it was out.',
  )
  await expect(says).toContainText(
    'Seaweed snack is the slowest mover, about 8 sold per sale day it is out.',
  )
  await expect(says).toContainText('53% of items sold are treats.')
  await expect(says).toContainText(
    '4 items were missing or damaged before sales ($3.23 at cost).',
  )
})
