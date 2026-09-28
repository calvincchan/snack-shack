import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'
import type { Page } from '@playwright/test'

/** The rows under "All items", never a toast that happens to be a list too. */
const allItems = (page: Page) =>
  page.getByRole('list', { name: 'All items' }).getByRole('listitem')

test.describe.configure({ mode: 'serial' })

test('the items list shows stock, cost, margin and band', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Items' }).click()

  // Mini bars: $17.99 for 130 = 13.84¢ a piece, sold 2 for $1 at 72%.
  const miniBars = allItems(page).filter({
    hasText: 'Nestlé mini bars, assorted',
  })
  await expect(miniBars).toContainText('130 on hand')
  await expect(miniBars).toContainText('$0.14 a piece')
  await expect(miniBars).toContainText('72%')
  await expect(miniBars).toContainText('Great deal')
  await expect(miniBars).toContainText('2 for $1')
  await expect(miniBars.getByRole('img', { name: 'Treat' })).toBeVisible()

  const popcorn = allItems(page).filter({ hasText: 'Popcorn, lightly salted' })
  await expect(popcorn).toContainText('$0.45 a piece')
  await expect(popcorn).toContainText('55%')
  await expect(popcorn.getByRole('img', { name: 'Snack' })).toBeVisible()
})

test('tapping a price option activates an item that needs a price', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: /^Items/ }).click()

  await expect(
    page.getByRole('heading', { name: 'Needs a price' }),
  ).toBeVisible()

  await expect(
    page.getByText('50 pieces · $0.30 a piece · logged by Yuki'),
  ).toBeVisible()

  // 29.98¢ a piece, so the four options read as they do in the prototype and
  // $1 is the suggested one.
  await expect(
    page.getByRole('button', { name: '$2 Great deal · 85% margin' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '2 for $1 Fair · 40% margin' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '3 for $1 Low margin · 10% margin' }),
  ).toBeVisible()

  await page
    .getByRole('button', { name: '$1 Suggested Great deal · 70% margin' })
    .click()

  await expect(page.getByText('Rice crackers is $1.')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Needs a price' }),
  ).toBeHidden()

  const row = allItems(page).filter({ hasText: 'Rice crackers' })
  await expect(row).toContainText('50 on hand')
  await expect(row).toContainText('70%')
})
