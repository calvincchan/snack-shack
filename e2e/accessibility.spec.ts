import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers/local-supabase'
import { COORDINATOR_EMAIL } from './global-setup'

/** Smallest side a finger target may have, in CSS pixels (CLAUDE.md: 44–48). */
const MIN_TARGET = 44

const screens = [
  { name: 'Sale day', link: 'Sale day' },
  { name: 'Sell', link: 'Sell' },
  { name: 'Buy', link: 'Buy' },
  { name: 'Items', link: /^Items/ },
  { name: 'Insights', link: 'Insights' },
]

async function tooSmall(page: Page) {
  return page.evaluate((min) => {
    const targets = document.querySelectorAll<HTMLElement>(
      'button, a[href], [role="button"], [role="tab"], [role="radio"], input:not([type="hidden"]), select, textarea',
    )
    return [...targets]
      .filter((el) => {
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        if (box.width === 0 || box.height === 0) return false
        if (style.visibility === 'hidden') return false
        // File inputs hide behind a label that is the real target.
        if (el instanceof HTMLInputElement && el.type === 'file') return false
        return Math.min(box.width, box.height) < min - 0.5
      })
      .map((el) => {
        const box = el.getBoundingClientRect()
        const label = el.getAttribute('aria-label') ?? el.textContent ?? ''
        return `${el.tagName.toLowerCase()} "${label.trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`
      })
  }, MIN_TARGET)
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme })

    for (const screen of screens) {
      test(`${screen.name}: targets are big enough, labels and contrast pass`, async ({
        page,
      }) => {
        await signIn(page, COORDINATOR_EMAIL)
        await page.getByRole('link', { name: screen.link }).first().click()
        await page.waitForLoadState('networkidle')

        expect(await tooSmall(page)).toEqual([])

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
        expect(
          results.violations.flatMap((v) =>
            v.nodes.map(
              (n) =>
                `${v.id}: ${n.target.join(' ')} ${n.any[0]?.message ?? ''}`,
            ),
          ),
        ).toEqual([])
      })
    }
  })
}

test('every button sets its own text colour', async ({ page }) => {
  await signIn(page, COORDINATOR_EMAIL)
  // A button inside a dark panel must not inherit the panel's colour by
  // accident, so each one carries a text-* utility or a variant that has one.
  for (const screen of screens) {
    await page.getByRole('link', { name: screen.link }).first().click()
    await page.waitForLoadState('networkidle')
    const bare = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button')]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => {
          const own = getComputedStyle(el).color
          const parent = getComputedStyle(el.parentElement!).color
          // Browsers give buttons ButtonText, not the parent's colour; if
          // it matches the parent, the colour came from inheritance.
          return (
            own === parent &&
            !/\btext-(?!xs|sm|base|lg|xl|\d|left|center|right)/.test(
              el.className,
            )
          )
        })
        .map((el) => el.textContent?.trim().slice(0, 30)),
    )
    expect(bare, screen.name).toEqual([])
  }
})

test('keyboard focus shows a ring on links, buttons and fields', async ({
  page,
}) => {
  await signIn(page, COORDINATOR_EMAIL)
  await page.getByRole('link', { name: 'Items' }).click()
  // Walk the page with the keyboard; each stop must draw a ring.
  const rings: string[] = []
  for (let stop = 0; stop < 8; stop++) {
    await page.keyboard.press('Tab')
    rings.push(
      await page.evaluate(() => {
        const el = document.activeElement!
        // Focus rests on the page itself before the first stop.
        if (el === document.body) return ''
        const s = getComputedStyle(el)
        const ring = s.boxShadow !== 'none' || s.outlineStyle !== 'none'
        return ring ? '' : el.outerHTML.slice(0, 60)
      }),
    )
  }
  expect(rings.filter(Boolean)).toEqual([])
})
