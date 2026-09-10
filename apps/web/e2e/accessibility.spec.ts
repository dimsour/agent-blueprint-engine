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

/**
 * The palette itself, measured directly.
 *
 * Sweeping pages only measures the colours those pages happened to render, and the severity
 * pairs are exactly the ones a healthy project never shows: the sweep above found the success
 * badge because the starter is clean, and would not have found the warning or danger badge at
 * all. So this renders every pair on its own ground and asks axe about that, which is a
 * question about the palette rather than about a fixture.
 */
test.describe('severity colours', () => {
  const PAIRS = [
    { name: 'success', fg: 'var(--success)', bg: 'var(--success-muted)' },
    { name: 'warning', fg: 'var(--warning)', bg: 'var(--warning-muted)' },
    { name: 'danger', fg: 'var(--danger)', bg: 'var(--danger-muted)' },
    { name: 'accent', fg: 'var(--accent)', bg: 'var(--accent-muted)' },
    { name: 'accent-on-page', fg: 'var(--accent)', bg: 'var(--background)' },
    { name: 'muted-text', fg: 'var(--muted-foreground)', bg: 'var(--background)' },
    { name: 'accent-foreground', fg: 'var(--accent-foreground)', bg: 'var(--accent)' },
  ]

  for (const theme of ['light', 'dark'] as const) {
    test(`every severity pair is readable in the ${theme} theme`, async ({ page }) => {
      await useTheme(page, theme)
      await page.goto('/')
      await expectTheme(page, theme)

      await page.evaluate((pairs) => {
        const host = document.createElement('div')
        host.id = 'palette-probe'
        for (const pair of pairs) {
          const swatch = document.createElement('p')
          swatch.textContent = `${pair.name} at the size a badge uses`
          swatch.style.cssText = `color:${pair.fg};background:${pair.bg};font-size:12px;font-weight:500;padding:4px`
          host.append(swatch)
        }
        document.body.prepend(host)
      }, PAIRS)

      expect(await violations(page, '#palette-probe')).toEqual([])
    })
  }
})

/**
 * A pointer on anything clickable (P9-05).
 *
 * Tailwind v4's preflight dropped the browser's own `cursor: pointer` on buttons, and nothing
 * put it back, so every button in the product showed a text caret. The fix is one rule, which
 * is exactly the kind of thing that gets reverted by a later change to the stylesheet — so it
 * is asserted on the real thing rather than trusted.
 */
test.describe('the cursor', () => {
  const cursorOf = (page: Page, selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).cursor)

  test('is a pointer on a button and not-allowed on a refused one', async ({ page }) => {
    await openStarter(page)
    await page
      .getByRole('navigation', { name: 'Blueprint artifacts' })
      .getByRole('button', { name: 'Export', exact: true })
      .click()
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible()

    expect(await cursorOf(page, 'button:not(:disabled)')).toBe('pointer')

    // The health bar disables a count with nothing behind it, which is a refusal, not a
    // control that failed to load.
    const zero = page.getByRole('button', { name: /^0 errors$/ })
    if (await zero.isDisabled()) {
      expect(await zero.evaluate((element) => getComputedStyle(element).cursor)).toBe('not-allowed')
    }
  })

  test('covers the buttons that are not the Button component', async ({ page }) => {
    await openStarter(page)
    const tree = page.getByRole('navigation', { name: 'Blueprint artifacts' })
    const row = tree.getByRole('button', { name: /^React testing(,|$)/ })

    // The project tree writes its rows as bare elements, which is why the rule is global.
    expect(await row.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer')
  })
})
