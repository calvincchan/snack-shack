import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL, VOLUNTEER_EMAIL } from './global-setup'

test.describe.configure({ mode: 'serial' })

// Closing a sale day changes what Insights reads, so put the seeded database
// back when this file is done.
test.afterAll(() => {
  execFileSync('supabase', ['db', 'reset', '--local'], { stdio: 'ignore' })
})

async function openSaleDayTab(page: Page, email: string) {
  await signIn(page, email)
  await page.getByRole('link', { name: 'Sale day' }).click()
}

const dock = (page: Page, heading: string) =>
  page.getByText(heading, { exact: true }).last().locator('..')

test('the start screen shows the last sale day and opens a new one', async ({
  page,
}) => {
  await openSaleDayTab(page, COORDINATOR_EMAIL)

  // The seed's last sale day, Sep 24: $142 close, $30 open and left in box.
  await expect(page.getByText(/Last sale day · .*Sep 24/)).toBeVisible()
  await expect(page.getByText('$112.00').first()).toBeVisible()

  await page.getByRole('button', { name: 'Count the cash box' }).click()
  await expect(page.getByText('Left in the box last time:')).toContainText(
    '$30.00',
  )
})

test('the open count warns when the box differs, then selling starts', async ({
  page,
}) => {
  await openSaleDayTab(page, COORDINATOR_EMAIL)
  const count = page.getByRole('list', { name: 'Open count' })

  for (let i = 0; i < 3; i++) {
    await count.getByRole('button', { name: 'One more $10 Bill' }).click()
  }
  await expect(dock(page, 'Open count')).toContainText('$30.00')
  await expect(page.getByText(/than left last time/)).toBeHidden()

  await count.getByRole('button', { name: 'One more $1 Loonie' }).click()
  await expect(page.getByText('$1.00 more than left last time')).toBeVisible()
  await page.getByLabel('Note (optional)').fill('Found a loonie in the box')

  await page.getByRole('button', { name: 'Start selling' }).click()
  await expect(
    page.getByRole('button', { name: "Sale's over: count the cash" }),
  ).toBeVisible()
  await expect(page.getByText('Note: Found a loonie in the box')).toBeVisible()
})

test('a second phone counts the close and closes the sale day', async ({
  page,
}) => {
  await openSaleDayTab(page, VOLUNTEER_EMAIL)
  await page
    .getByRole('button', { name: "Sale's over: count the cash" })
    .click()

  const count = page.getByRole('list', { name: 'Close count' })
  for (let i = 0; i < 5; i++) {
    await count.getByRole('button', { name: 'One more $20 Bill' }).click()
  }
  await expect(dock(page, 'Close count')).toContainText('$100.00')
  // Revenue is close − open: $100 − $31. Left in box defaults to the change
  // float, which another spec may have changed, so set it.
  await expect(page.getByText('$69.00')).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Dollars left in box', exact: true })
    .fill('30')
  await expect(page.getByText('$70.00')).toBeVisible()

  await page.getByRole('button', { name: 'Close sale day' }).click()
  await expect(
    page.getByRole('heading', { name: 'Seal $70.00 in the deposit bag' }),
  ).toBeVisible()
  await expect(page.getByText('Leave $30.00 in the box.')).toBeVisible()
  await expect(page.getByText('Yuki', { exact: true })).toBeVisible()
})
