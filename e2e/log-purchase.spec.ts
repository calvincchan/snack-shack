import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

test.describe.configure({ mode: 'serial' })

const allItems = (page: Page) =>
  page.getByRole('list', { name: 'All items' }).getByRole('listitem')

/** A stand-in for the photo of the receipt. */
const receiptPhoto = {
  name: 'receipt.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
}

test('logging a receipt adds the stock, the cost and the claim', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()
  await page.getByRole('tab', { name: 'Log purchase' }).click()

  await page.getByLabel('Store').selectOption('Costco')
  await page
    .getByLabel('Bought by (reimbursed later)')
    .selectOption({ label: 'Calvin' })

  await page.getByLabel('Name kids will see').fill('Wafer bars, assorted')
  await page.getByRole('radio', { name: 'Treat (sugary)' }).click()
  await page.getByLabel('Pieces in total').fill('130')
  await page.getByLabel('Cost incl. tax').fill('17.99')

  // 13.84¢ a piece, so 2 for $1 is suggested at 72% (HANDOFF §5.3).
  await expect(page.getByText('Cost $0.14 a piece (13.8¢)')).toBeVisible()
  await page
    .getByRole('button', { name: '2 for $1 Suggested Great deal · 72% margin' })
    .click()

  await expect(page.getByText('Receipt total')).toBeVisible()
  await expect(page.getByText('$17.99')).toBeVisible()

  await page
    .getByLabel('Attach a photo of the receipt')
    .setInputFiles(receiptPhoto)
  await page
    .getByRole('button', { name: 'Save and claim reimbursement' })
    .click()

  await expect(
    page.getByRole('heading', { name: 'Receipt logged' }),
  ).toBeVisible()

  await page.getByRole('link', { name: /^Items/ }).click()
  const row = allItems(page).filter({ hasText: 'Wafer bars, assorted' })
  await expect(row).toContainText('130 on hand')
  await expect(row).toContainText('$0.14 a piece')
  await expect(row).toContainText('2 for $1')
  await expect(row).toContainText('Great deal')
})

test('the claim it created links to the receipt photo', async ({
  page,
  context,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()
  await page.getByRole('tab', { name: 'Claims' }).click()

  // SS-006 is the receipt the first test logged, photo and all.
  const opened = context.waitForEvent('page')
  await page.getByRole('button', { name: /SS-006/ }).click()
  const receipt = await opened
  await receipt.waitForURL(/\/storage\/v1\/object\/sign\/receipts\//)

  expect(receipt.url()).toContain('/storage/v1/object/sign/receipts/')
  await receipt.close()
})

test('a receipt line cannot be saved without the numbers or the photo', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()
  await page.getByRole('tab', { name: 'Log purchase' }).click()

  await page
    .getByRole('button', { name: 'Save and claim reimbursement' })
    .click()
  await expect(page.getByRole('alert')).toHaveText(
    'Pick who is being reimbursed.',
  )

  await page
    .getByLabel('Bought by (reimbursed later)')
    .selectOption({ label: 'Yuki' })
  await page
    .getByRole('button', { name: 'Save and claim reimbursement' })
    .click()
  await expect(page.getByRole('alert')).toHaveText(
    'Attach a photo of the receipt.',
  )

  await page
    .getByLabel('Attach a photo of the receipt')
    .setInputFiles(receiptPhoto)
  await page
    .getByRole('button', { name: 'Save and claim reimbursement' })
    .click()
  await expect(page.getByRole('alert')).toHaveText(
    'Receipt line 1: name the item.',
  )

  await page.getByLabel('Name kids will see').fill('Rice cakes')
  await page
    .getByRole('button', { name: 'Save and claim reimbursement' })
    .click()
  await expect(page.getByRole('alert')).toHaveText(
    'Receipt line 1: how many pieces in total?',
  )

  await page.getByLabel('Pieces in total').fill('20')
  await page
    .getByRole('button', { name: 'Save and claim reimbursement' })
    .click()
  await expect(page.getByRole('alert')).toHaveText(
    'Receipt line 1: what did it cost, tax included?',
  )
})

test('a second receipt line tops up an item that is already stocked', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Buy' }).click()
  await page.getByRole('tab', { name: 'Log purchase' }).click()

  await page
    .getByLabel('Bought by (reimbursed later)')
    .selectOption({ label: 'Yuki' })
  await page.getByLabel('Item').selectOption({ label: 'Pretzel twists' })
  await page.getByLabel('Pieces in total').fill('60')
  await page.getByLabel('Cost incl. tax').fill('22.80')

  // Same cost per piece as the seeded box, so the weighted average holds.
  await expect(
    page.getByRole('button', { name: /^Keep the price/ }),
  ).toBeVisible()

  await page
    .getByLabel('Attach a photo of the receipt')
    .setInputFiles(receiptPhoto)
  await page
    .getByRole('button', { name: 'Save and claim reimbursement' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Receipt logged' }),
  ).toBeVisible()

  await page.getByRole('link', { name: /^Items/ }).click()
  // 42 left after the seeded sale day, plus this box of 60.
  const row = allItems(page).filter({ hasText: 'Pretzel twists' })
  await expect(row).toContainText('102 on hand')
  await expect(row).toContainText('$0.38 a piece')
})
