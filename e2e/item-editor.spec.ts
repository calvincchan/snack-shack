import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL, VOLUNTEER_EMAIL } from './global-setup'

test.describe.configure({ mode: 'serial' })

const allItems = (page: Page) =>
  page.getByRole('list', { name: 'All items' }).getByRole('listitem')

/** The editor sheet, named after the item it opened on. */
const editorFor = (page: Page, name: string) =>
  page.getByRole('dialog', { name })

async function openEditor(page: Page, name: string) {
  await allItems(page).filter({ hasText: name }).click()
  const editor = editorFor(page, name)
  await expect(editor).toBeVisible()
  return editor
}

async function openItems(page: Page, email: string) {
  await signIn(page, email)
  await page.getByRole('link', { name: /^Items/ }).click()
  await expect(page.getByRole('heading', { name: 'All items' })).toBeVisible()
}

test('the editor changes price, type, storage and the name kids see', async ({
  page,
}) => {
  await openItems(page, COORDINATOR_EMAIL)
  const editor = await openEditor(page, 'Veggie straws')

  await editor.getByRole('button', { name: /^\$2/ }).click()
  await editor.getByRole('radio', { name: 'Treat (sugary)' }).click()
  await editor.getByRole('radio', { name: '❄ Freezer' }).click()
  await editor.getByLabel('Name kids see').fill('Veggie straws, big bag')
  await editor.getByRole('button', { name: 'Save' }).click()

  const row = allItems(page).filter({ hasText: 'Veggie straws, big bag' })
  await expect(row).toContainText('$2')
  await expect(row).toContainText('❄ Freezer')
  await expect(row.getByRole('img', { name: 'Treat' })).toBeVisible()
})

test('archiving takes an item off the list, and it can come back', async ({
  page,
}) => {
  await openItems(page, COORDINATOR_EMAIL)

  const editor = await openEditor(page, 'Seaweed snack')
  await editor.getByRole('button', { name: 'Archive this item' }).click()
  await expect(allItems(page).filter({ hasText: 'Seaweed snack' })).toHaveCount(
    0,
  )

  await page.getByRole('button', { name: 'Show archived items' }).click()
  const archived = page
    .getByRole('list', { name: 'Archived items' })
    .getByRole('listitem')
  await archived.filter({ hasText: 'Seaweed snack' }).click()

  await editorFor(page, 'Seaweed snack')
    .getByRole('button', { name: 'Put back on the list' })
    .click()
  await expect(
    allItems(page).filter({ hasText: 'Seaweed snack' }),
  ).toBeVisible()
})

test('two phones editing the same item: the second save asks whose edit to keep', async ({
  browser,
}) => {
  const firstPhone = await browser.newContext(test.info().project.use)
  const secondPhone = await browser.newContext(test.info().project.use)
  const yuki = await firstPhone.newPage()
  const calvin = await secondPhone.newPage()

  await openItems(yuki, VOLUNTEER_EMAIL)
  await openItems(calvin, COORDINATOR_EMAIL)

  // Both open Chocolate bar, which starts at $2.
  const yukisEditor = await openEditor(yuki, 'Chocolate bar')
  const calvinsEditor = await openEditor(calvin, 'Chocolate bar')

  // Yuki saves first.
  await yukisEditor.getByRole('button', { name: /^\$1 / }).click()
  await yukisEditor.getByRole('button', { name: 'Save' }).click()
  await expect(yuki.getByText('Chocolate bar saved.')).toBeVisible()

  // Calvin's screen still holds the version he loaded.
  await calvinsEditor.getByRole('button', { name: /^2 for \$1/ }).click()
  await calvinsEditor.getByRole('button', { name: 'Save' }).click()

  const prompt = calvin.getByRole('dialog', { name: /changed this to/ })
  await expect(prompt).toContainText('Yuki changed this to $1')
  await expect(
    prompt.getByRole('button', { name: /^Keep Yuki's/ }),
  ).toBeVisible()

  // Nothing was written over without him saying so.
  await expect(
    allItems(yuki).filter({ hasText: 'Chocolate bar' }),
  ).toContainText('$1')

  await prompt.getByRole('button', { name: /^Keep mine/ }).click()
  await expect(
    allItems(calvin).filter({ hasText: 'Chocolate bar' }),
  ).toContainText('2 for $1')

  await firstPhone.close()
  await secondPhone.close()
})

test('the editor lists who changed an item and when', async ({ page }) => {
  await openItems(page, COORDINATOR_EMAIL)
  const editor = await openEditor(page, 'Cheddar crackers')

  await editor.getByRole('button', { name: /^\$2/ }).click()
  await editor.getByRole('button', { name: 'Save' }).click()

  const reopened = await openEditor(page, 'Cheddar crackers')
  await reopened.getByRole('button', { name: 'History' }).click()
  await expect(reopened.getByText('Price changed $1 → $2')).toBeVisible()
  await expect(reopened.getByText(/ · /).first()).toBeVisible()
})
