/**
 * Accessibility, checked rather than asserted (P8-06).
 *
 * axe finds the things a machine can find — a control with no name, contrast below the
 * threshold, a landmark used wrongly — across the screens a person actually passes through,
 * in both themes, because a colour that passes on one ground can fail on the other. What axe
 * cannot check is whether the app is usable from a keyboard, so the second half of this file
 * drives the surfaces with keys only and asserts where focus ended up.
 *
 * Violations are reported by rule and by the element they were found on. A failure here names
 * the selector, so the fix starts from the element rather than from a count.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

type Theme = 'light' | 'dark'

/** WCAG 2.1 AA, which is what the contrast and naming rules below are measured against. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * Chooses the theme before the app loads.
 *
 * Setting the class afterwards races `next-themes`, which reads the stored preference on its
 * first render and puts the class back: the check would then measure whichever of the two won,
 * which is how a colour that fails passes intermittently. Writing the preference first means
 * the app renders in that theme to begin with.
 */
async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript((next) => {
    localStorage.setItem('ab:ui:theme', next)
  }, theme)
}

/** The class `next-themes` sets, so a check never runs against a half-applied theme. */
async function expectTheme(page: Page, theme: Theme): Promise<void> {
  await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /\blight\b/)
}

/**
 * Every violation, as `rule: selector` lines, so a failure says what to open. Contrast
 * failures also carry the two colours and the ratio, because "it fails" and "it fails by
 * 0.3" call for different fixes.
 */
async function violations(page: Page, within?: string): Promise<string[]> {
  const builder = new AxeBuilder({ page }).withTags(TAGS)
  const result = await (within ? builder.include(within) : builder).analyze()
  return result.violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const data = node.any[0]?.data as
        | {
            fgColor?: string
            bgColor?: string
            contrastRatio?: number
            expectedContrastRatio?: string
          }
        | undefined
      const detail =
        violation.id === 'color-contrast' && data?.contrastRatio !== undefined
          ? ` (${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}, needs ${data.expectedContrastRatio})`
          : ''
      return `${violation.id}: ${node.target.join(' ')}${detail}`
    }),
  )
}

async function openStarter(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /React Expert/ }).click()
  await page.waitForURL(/\/p\//)
  await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
  // The route's title arrives with the client transition; axe reads the document, not the app.
  await expect(page).toHaveTitle(/Agent Blueprint/)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test('the dashboard has no violations', async ({ page }) => {
      await useTheme(page, theme)
      await page.goto('/')
      await expectTheme(page, theme)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      expect(await violations(page)).toEqual([])
    })

    test('the workspace has no violations', async ({ page }) => {
      await useTheme(page, theme)
      await openStarter(page)
      await expectTheme(page, theme)

      expect(await violations(page)).toEqual([])
    })

    test('the settings screen has no violations', async ({ page }) => {
      await useTheme(page, theme)
      await page.goto('/settings')
      await expectTheme(page, theme)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      expect(await violations(page)).toEqual([])
    })

    test('the wizard has no violations', async ({ page }) => {
      await useTheme(page, theme)
      await page.goto('/new')
      await expectTheme(page, theme)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      expect(await violations(page)).toEqual([])
    })
  })
}

test.describe('the views behind the workspace', () => {
  /** Each view, and something on it that only appears once it has rendered. */
  const VIEWS = [
    { name: 'Evaluation', ready: { role: 'list' as const, label: 'Dimension scores' } },
    { name: 'Compatibility', ready: { role: 'list' as const, label: 'Compile targets' } },
    { name: 'Export', ready: { role: 'button' as const, label: /Download/ } },
    { name: 'Overview', ready: { role: 'group' as const, label: 'Filter by kind' } },
  ]

  for (const view of VIEWS) {
    test(`${view.name} has no violations`, async ({ page }) => {
      await openStarter(page)
      await page
        .getByRole('navigation', { name: 'Blueprint artifacts' })
        .getByRole('button', { name: view.name, exact: true })
        .click()
      await expect(page.getByRole(view.ready.role, { name: view.ready.label })).toBeVisible()

      expect(await violations(page)).toEqual([])
    })
  }

  test('an open dialog has no violations', async ({ page }) => {
    await openStarter(page)
    await page.getByRole('button', { name: 'GitHub' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect(await violations(page, '[role="dialog"]')).toEqual([])
  })
})

/**
 * The half axe cannot check.
 *
 * A page can satisfy every rule and still be unreachable from a keyboard. These drive the
 * surfaces with keys only and assert where focus ended up, which is the thing a person
 * without a mouse actually depends on.
 */
test.describe('from the keyboard alone', () => {
  test('the first stop is a way past the project tree', async ({ page }) => {
    await openStarter(page)
    await page.locator('body').press('Tab')

    const skip = page.getByRole('link', { name: 'Skip to the editor' })
    await expect(skip).toBeFocused()
    // Hidden until it has focus, so it costs the layout nothing.
    await expect(skip).toBeVisible()

    await skip.press('Enter')
    await expect(page.locator('#workspace-editor')).toBeVisible()
  })

  test('the panel separators can be moved without a mouse', async ({ page }) => {
    await openStarter(page)
    const separator = page.getByRole('separator', { name: 'Resize the project panel' })

    const before = await page.locator('#sidebar').boundingBox()
    await separator.focus()
    await expect(separator).toBeFocused()
    for (let press = 0; press < 5; press += 1) await separator.press('ArrowRight')

    const after = await page.locator('#sidebar').boundingBox()
    expect(after?.width ?? 0).toBeGreaterThan(before?.width ?? 0)
  })

  test('the workspace announces its regions', async ({ page }) => {
    await openStarter(page)

    // One main, and an inspector a screen reader can jump to by landmark.
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
  })

  test('the command palette opens, filters and closes on the keyboard', async ({ page }) => {
    await openStarter(page)
    await page.keyboard.press('ControlOrMeta+k')

    const palette = page.getByRole('dialog')
    await expect(palette).toBeVisible()
    await page.keyboard.type('evaluat')
    await expect(palette.getByRole('option').first()).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
  })

  test('a dialog returns focus to what opened it', async ({ page }) => {
    await openStarter(page)
    const button = page.getByRole('button', { name: 'GitHub' })
    await button.focus()
    await button.press('Enter')

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page.getByRole('dialog')).toBeHidden()
    // Losing the place you were in is what makes a keyboard user stop using dialogs.
    await expect(button).toBeFocused()
  })

  test('every artifact in the tree is reachable and opens with a key', async ({ page }) => {
    await openStarter(page)
    const tree = page.getByRole('navigation', { name: 'Blueprint artifacts' })
    const skill = tree.getByRole('button', { name: /^React rendering(,|$)/ })

    await skill.focus()
    await expect(skill).toBeFocused()
    await skill.press('Enter')

    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
      'React rendering',
    )
  })
})

test.describe('reduced motion', () => {
  test('nothing animates, and everything still opens and closes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openStarter(page)

    const button = page.getByRole('button', { name: 'GitHub' })
    await button.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // The reason the rule sets a near-zero duration rather than `none`: Radix unmounts on
    // `animationend`, and an animation that never runs never ends.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()

    const duration = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.transition = 'opacity 300ms'
      document.body.append(probe)
      const value = getComputedStyle(probe).transitionDuration
      probe.remove()
      return value
    })
    // 0.01ms, which the browser reports in scientific notation.
    expect(Number.parseFloat(duration)).toBeLessThan(0.001)
  })
})
