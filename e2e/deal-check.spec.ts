import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

test.describe.configure({ mode: 'serial' })

test('deal check works out the box and carries it into Log purchase', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()

  // The prototype's example: $17.99 for 130 mini bars, GST already on the label.
  await page.getByLabel('Shelf price').fill('17.99')
  await page.getByLabel('Pieces in the box').fill('130')
  await page.getByRole('radio', { name: 'Treat (sugary)' }).click()
  await page.getByRole('button', { name: '+ 5% GST' }).click()

  const result = page
    .getByText('Profit on the box')
    .locator('xpath=ancestor::section')
  await expect(result).toContainText('2 for $1')
  await expect(result).toContainText('Great deal')
  await expect(result).toContainText('$0.14')
  await expect(result).toContainText('$65.00')
  await expect(result).toContainText('$47.01')

  // The seeded sale days give treats a rate of 22 pieces a day, so the 130
  // pieces last about 5.9 sale days: just under the six that warn.
  await expect(result).toContainText('than our usual treats')
  await expect(result).toContainText('Lasts about 5.9 sale days')
  await expect(result).not.toContainText('make sure it fits')

  await page.getByRole('button', { name: 'Bought it' }).click()

  await expect(
    page.getByText('Numbers carried over. Add a name and the receipt photo.'),
  ).toBeVisible()
  await expect(page.getByLabel('Pieces in total')).toHaveValue('130')
  await expect(page.getByLabel('Cost incl. tax')).toHaveValue('17.99')
  await expect(
    page.getByRole('radio', { name: 'Treat (sugary)' }),
  ).toHaveAttribute('aria-checked', 'true')
  await expect(
    page.getByRole('button', { name: /^2 for \$1/ }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('adding GST changes the numbers', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()

  await page.getByLabel('Shelf price').fill('17.99')
  await page.getByLabel('Pieces in the box').fill('130')

  // The toggle starts on, so the box costs $18.89.
  const result = page
    .getByText('Profit on the box')
    .locator('xpath=ancestor::section')
  await expect(result).toContainText('$18.89')

  await page.getByRole('button', { name: '+ 5% GST' }).click()
  await expect(result).toContainText('$17.99')
})
