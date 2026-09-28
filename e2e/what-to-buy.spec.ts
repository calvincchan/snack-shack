import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL, VOLUNTEER_EMAIL } from './global-setup'

test.describe.configure({ mode: 'serial' })

// The seed closes one sale day: 106 pieces sold, the gummies at 0 and a note.
test('stock by type shows the gauges, the rate and what to buy', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()

  await expect(
    page.getByRole('heading', { name: 'Stock by type' }),
  ).toBeVisible()

  const snacks = page.getByRole('progressbar', {
    name: 'Snacks against target stock',
  })
  await expect(snacks).toBeVisible()
  await expect(page.getByText('58 sold a sale day')).toBeVisible()
  await expect(page.getByText('48 sold a sale day')).toBeVisible()
  await expect(page.getByText('Covered for 2+ sale days').first()).toBeVisible()
})

test('tips call out what ran out and what the last count up said', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()

  const tips = page.getByRole('list', { name: 'Tips from recent sales' })
  await expect(tips).toContainText(
    'Fruit gummies is out. Buy more on the next trip.',
  )
  await expect(tips).toContainText('Gummies went first')
})

test('one volunteer claims the shopping trip and everyone else sees it', async ({
  browser,
}) => {
  const yukisPhone = await browser.newContext()
  const calvinsPhone = await browser.newContext()
  const yuki = await yukisPhone.newPage()
  const calvin = await calvinsPhone.newPage()

  await signIn(yuki, VOLUNTEER_EMAIL)
  await yuki.getByRole('link', { name: 'Buy' }).click()
  await yuki.getByLabel('When are you going?').fill('Thursday')
  await yuki.getByRole('button', { name: "I'm going shopping" }).click()

  await expect(
    yuki.getByText('You are going shopping, Thursday.'),
  ).toBeVisible()
  await expect(
    yuki.getByRole('button', { name: 'Cancel the trip' }),
  ).toBeVisible()

  // Calvin sees Yuki's trip and cannot cancel it.
  await signIn(calvin, COORDINATOR_EMAIL)
  await calvin.getByRole('link', { name: 'Buy' }).click()
  await expect(
    calvin.getByText('Yuki is going shopping, Thursday.'),
  ).toBeVisible()
  await expect(
    calvin.getByRole('button', { name: 'Cancel the trip' }),
  ).toBeHidden()
  await expect(
    calvin.getByRole('button', { name: "I'm going shopping" }),
  ).toBeHidden()

  // Yuki cancels, and the offer comes back.
  await yuki.getByRole('button', { name: 'Cancel the trip' }).click()
  await expect(
    yuki.getByRole('button', { name: "I'm going shopping" }),
  ).toBeVisible()

  await yukisPhone.close()
  await calvinsPhone.close()
})
