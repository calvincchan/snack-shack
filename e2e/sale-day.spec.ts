import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL, VOLUNTEER_EMAIL } from './global-setup'

test.describe.configure({ mode: 'serial' })

// Closing a sale day changes the sales history that later specs read (what to
// buy, the tips), so put the seeded database back when this file is done.
test.afterAll(() => {
  execFileSync('supabase', ['db', 'reset', '--local'], { stdio: 'ignore' })
})

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

test('the sell helper adds up a basket and shows the change', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Sell', exact: true }).click()

  const tiles = page.getByRole('list', { name: 'Tiles' })
  await tiles.getByRole('button', { name: /Chips, assorted/ }).click()
  await expect(page.getByText('1 of 3 items')).toBeVisible()

  await page
    .getByRole('group', { name: 'Paid with' })
    .getByRole('button', { name: '$5' })
    .click()
  await expect(page.getByRole('status')).toHaveText(/^Change \$4\.00$/)

  // One treat per kid: the other treat tiles go grey.
  const treats = tiles.getByRole('button').filter({ hasText: 'Treat' })
  await treats.first().click()
  await expect(page.getByText('1 of 1 treat')).toBeVisible()
  await expect(treats.first()).toBeDisabled()

  await page.getByRole('button', { name: 'Next kid' }).click()
  await expect(page.getByText('0 of 3 items')).toBeVisible()
  await expect(treats.first()).toBeEnabled()
})

test('one volunteer signs off, both phones see the deposit', async ({
  page,
  browser,
}) => {
  await openSaleDay(page, COORDINATOR_EMAIL)

  // Other specs may have changed the float in settings, so read it.
  const floatText = await page.getByText(/^Change float \$/).innerText()
  const floatCents = Math.round(Number(floatText.replace(/[^\d.]/g, '')) * 100)
  await page.getByRole('button', { name: "Sale's over: count up" }).click()

  // 10 bags of chips gone at $1 each, so $10 of sales; the rest is untouched.
  const chips = page
    .getByRole('list', { name: 'Count stock' })
    .getByRole('listitem')
    .filter({ hasText: 'Chips, assorted' })
  for (let tap = 0; tap < 10; tap++) {
    await chips
      .getByRole('button', { name: 'One fewer Chips, assorted left' })
      .click()
  }
  await expect(chips).toContainText('Sold 10 · $10.00')

  // Two twenties are counted; the deposit is that less the change float.
  await page.getByRole('button', { name: 'Count cash' }).click()
  await page.getByRole('button', { name: 'One more $20' }).click()
  await page.getByRole('button', { name: 'One more $20' }).click()
  await expect(page.getByText(/^Counted \$40\.00 of /)).toBeVisible()

  await page.getByRole('button', { name: 'Sign off' }).click()
  const finish = page.getByRole('button', { name: 'Finish count up' })
  await expect(finish).toBeDisabled()
  await page.getByRole('button', { name: 'I counted and confirm' }).click()
  await expect(page.getByText(/Confirmed by/)).toBeVisible()
  await expect(finish).toBeEnabled()

  // A second volunteer is on their own phone; they land on Done too.
  const context = await browser.newContext()
  const second = await context.newPage()
  await openSaleDay(second, VOLUNTEER_EMAIL)
  await finish.click()

  const deposit = `Seal $${((4000 - floatCents) / 100).toFixed(2)} in the deposit bag`
  await expect(page.getByRole('heading', { name: deposit })).toBeVisible()
  await expect(second.getByRole('heading', { name: deposit })).toBeVisible()
  await context.close()
})
