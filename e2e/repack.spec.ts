import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

test.describe.configure({ mode: 'serial' })

test('a repack moves stock into a new item and shows on Items', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: /^Items/ }).click()
  await page.getByRole('button', { name: 'Repack', exact: true }).click()

  // 1. What went in: 2 popcorn (45¢) + 1 mini bar (13.84¢) a pack.
  await page.getByRole('button', { name: /Popcorn, lightly salted/ }).click()
  await page
    .getByRole('button', { name: 'One more Popcorn, lightly salted per pack' })
    .click()
  await page.getByRole('button', { name: /Nestlé mini bars, assorted/ }).click()
  await expect(page.getByText('One pack costs $1.04')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  // 2. What you made: a new item at $2, 3 packs.
  await page.getByRole('button', { name: 'New item' }).click()
  await page.getByLabel('Name kids will see').fill('Movie night pack')
  await page
    .getByRole('radiogroup', { name: 'Type for the new item' })
    .getByRole('radio', { name: 'Snack' })
    .click()
  await page.getByRole('button', { name: /^\$2/ }).click()
  await page.getByRole('textbox', { name: 'Packs made' }).fill('3')
  await page.getByRole('button', { name: 'Next' }).click()

  // 3. Check and save.
  const changes = page.getByRole('list', { name: 'Stock changes' })
  await expect(changes).toContainText('Popcorn, lightly salted−6')
  await expect(changes).toContainText('Nestlé mini bars, assorted−3')
  await expect(changes).toContainText('Movie night pack+3')
  await expect(page.getByText('Costs $1.04 a pack')).toBeVisible()
  await page.getByRole('button', { name: 'Save repack' }).click()

  await expect(page.getByText('Repacked 3 Movie night packs')).toBeVisible()
  const allItems = page
    .getByRole('list', { name: 'All items' })
    .getByRole('listitem')
  await expect(allItems.filter({ hasText: 'Movie night pack' })).toContainText(
    'Not counted · bought 0 · repacked +3',
  )
  await expect(
    allItems.filter({ hasText: 'Popcorn, lightly salted' }),
  ).toContainText('repacked −6')
})

test('an item set to repack only moves to its own list', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: /^Items/ }).click()

  await page
    .getByRole('list', { name: 'All items' })
    .getByRole('button', { name: /Movie night pack/ })
    .click()
  await page.getByRole('radio', { name: 'Repack only' }).click()
  await expect(
    page.getByText(
      'Only used in repacks. Needs no price and stays out of Insights.',
    ),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(
    page
      .getByRole('list', { name: 'Repack only items' })
      .getByRole('listitem')
      .filter({ hasText: 'Movie night pack' }),
  ).toContainText('repacked +3')
})
