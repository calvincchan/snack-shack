import { expect, test } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

const VOLUNTEER_EMAIL = 'yuki@example.com'
const STRANGER_EMAIL = 'stranger@example.com'

// One local database, one story: the coordinator signs in, adds Yuki, and Yuki
// signs in on her own phone.
test.describe.configure({ mode: 'serial' })

test('the coordinator signs in and adds a volunteer', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)

  await expect(page.getByRole('link', { name: 'Sale day' })).toBeVisible()

  await page.getByRole('button', { name: /^Signed in as / }).click()
  await page.getByRole('link', { name: 'Team and settings' }).click()

  await page.getByLabel('Email').fill(VOLUNTEER_EMAIL)
  await page.getByLabel('Name').fill('Yuki')
  await page.getByRole('button', { name: 'Add to the team' }).click()

  await expect(
    page.getByRole('heading', { name: 'Waiting to sign in' }),
  ).toBeVisible()
  await expect(page.getByText(VOLUNTEER_EMAIL)).toBeVisible()
})

test('the coordinator changes a setting', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'Settings' }).click()

  await page.getByLabel('Change float').fill('40.00')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible()

  await page.reload()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByLabel('Change float')).toHaveValue('40.00')
})

test('two phones sign in as two different volunteers', async ({ browser }) => {
  const coordinatorPhone = await browser.newContext()
  const volunteerPhone = await browser.newContext()

  const coordinator = await coordinatorPhone.newPage()
  await signIn(coordinator, COORDINATOR_EMAIL)

  const volunteer = await volunteerPhone.newPage()
  await signIn(volunteer, VOLUNTEER_EMAIL)

  await expect(
    coordinator.getByRole('button', { name: 'Signed in as coordinator' }),
  ).toBeVisible()
  await expect(
    volunteer.getByRole('button', { name: 'Signed in as Yuki' }),
  ).toBeVisible()

  await coordinatorPhone.close()
  await volunteerPhone.close()
})

test('a volunteer cannot reach the admin screens', async ({ page }) => {
  await signIn(page, VOLUNTEER_EMAIL)

  await page.getByRole('button', { name: 'Signed in as Yuki' }).click()
  await expect(
    page.getByRole('link', { name: 'Team and settings' }),
  ).toBeHidden()

  await page.goto('/admin')
  await expect(
    page.getByText('Only the coordinator can open this screen.'),
  ).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Team' })).toBeHidden()
})

test('the session survives closing and reopening the app', async ({ page }) => {
  await signIn(page, VOLUNTEER_EMAIL)
  await expect(
    page.getByRole('button', { name: 'Signed in as Yuki' }),
  ).toBeVisible()

  await page.goto('/')
  await page.reload()

  await expect(
    page.getByRole('button', { name: 'Signed in as Yuki' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sale day' })).toBeVisible()
})

test('someone the coordinator has not added is told to ask', async ({
  page,
}) => {
  await signIn(page, STRANGER_EMAIL)

  await expect(
    page.getByRole('heading', { name: 'Ask the coordinator to add you' }),
  ).toBeVisible()
  await expect(page.getByText(STRANGER_EMAIL)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sale day' })).toBeHidden()
})
