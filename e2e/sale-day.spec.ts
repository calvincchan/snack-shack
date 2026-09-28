import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

test.describe.configure({ mode: 'serial' })

const dock = (page: Page) => page.getByText(/snacks? · \d+ treats?/)

async function openSaleDay(page: Page, email: string) {
  await signIn(page, email)
  await page.getByRole('link', { name: 'Sale day' }).click()
}

test('a volunteer starts a sale day and gets a suggested lineup', async ({
  page,
}) => {
  await openSaleDay(page, COORDINATOR_EMAIL)
  await page.getByRole('button', { name: 'Start a sale day' }).click()

  await expect(
    page.getByRole('heading', { name: "Pick today's lineup" }),
  ).toBeVisible()

  // The suggestion is three snacks and two treats (HANDOFF §5.6), and the
  // bottom bar reassures the team about the margin behind them.
  await expect(dock(page)).toHaveText('3 snacks · 2 treats')
  await expect(page.getByText(/about \d+% margin/)).toBeVisible()

  // Nothing has been out since the seeded sale day, so everything is New.
  await expect(
    page.getByRole('list', { name: 'Snacks' }).getByText('New').first(),
  ).toBeVisible()

  // The gummies sold out on the seeded sale day, so they cannot be picked.
  await expect(page.getByText('Fruit gummies')).toBeHidden()
})

test('picking an extra item changes the lineup counts', async ({ page }) => {
  await openSaleDay(page, COORDINATOR_EMAIL)

  const chips = page
    .getByRole('list', { name: 'Snacks' })
    .getByRole('button', { name: /Chips, assorted/ })
  await expect(chips).toHaveAttribute('aria-pressed', 'false')

  await chips.click()
  await expect(chips).toHaveAttribute('aria-pressed', 'true')
  await expect(dock(page)).toHaveText('4 snacks · 2 treats')
})

test('check stock records what is damaged, then the sale starts', async ({
  page,
}) => {
  await openSaleDay(page, COORDINATOR_EMAIL)
  await page.getByRole('button', { name: 'Check stock' }).click()

  await expect(
    page.getByRole('heading', { name: 'Check the boxes' }),
  ).toBeVisible()

  const chips = page
    .getByRole('list', { name: 'Check stock' })
    .getByRole('listitem')
    .filter({ hasText: 'Chips, assorted' })
  await expect(chips).toContainText('matches')

  await chips.getByRole('button', { name: 'One fewer Chips, assorted' }).click()
  await chips.getByRole('button', { name: 'One fewer Chips, assorted' }).click()
  await expect(chips).toContainText('2 short')

  await chips.getByRole('button', { name: 'damaged' }).click()
  await expect(page.getByText('1 item off')).toBeVisible()

  await page.getByRole('button', { name: 'Start sale' }).click()
  await expect(
    page.getByRole('heading', { name: 'Sale in progress' }),
  ).toBeVisible()

  const table = page.getByRole('list', { name: 'On the table' })
  await expect(
    table.getByRole('listitem').filter({ hasText: 'Chips' }),
  ).toContainText('$1')
  await expect(
    page.getByText('Reported before the sale: 2 damaged (Chips, assorted).'),
  ).toBeVisible()
})

test("a price changed during the sale does not move today's price", async ({
  page,
}) => {
  await openSaleDay(page, COORDINATOR_EMAIL)

  await page.getByRole('link', { name: /^Items/ }).click()
  await page
    .getByRole('list', { name: 'All items' })
    .getByRole('listitem')
    .filter({ hasText: 'Chips, assorted' })
    .click()
  const editor = page.getByRole('dialog', { name: 'Chips, assorted' })
  await editor.getByRole('button', { name: /^\$2/ }).click()
  await editor.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('link', { name: 'Sale day' }).click()
  const chips = page
    .getByRole('list', { name: 'On the table' })
    .getByRole('listitem')
    .filter({ hasText: 'Chips, assorted' })
  await expect(chips).toContainText('$1')
  await expect(chips).not.toContainText('$2')
})
