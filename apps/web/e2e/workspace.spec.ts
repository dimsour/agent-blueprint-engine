import { expect, type Page, test } from '@playwright/test'

/** Opens the React Expert starter and waits for the workspace to finish loading. */
async function openStarter(page: Page, label = 'React Expert') {
  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(label) }).click()
  await page.waitForURL(/\/p\//)
  await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
}

/** The page itself must never scroll sideways; panels scroll inside their own bounds. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('dashboard', () => {
  test('lists the starter blueprints and the ways to begin', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Design once')
    await expect(page.getByRole('button', { name: 'Create Blueprint' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import ZIP' })).toBeVisible()

    await expect(page.getByText('10 complete agent systems')).toBeVisible()
    await expect(page.getByRole('button', { name: /React Expert/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Full Software Engineering Team/ })).toBeVisible()
  })

  test('creating from a template opens the workspace with the blueprint loaded', async ({
    page,
  }) => {
    await openStarter(page)

    // The top bar names the project and the tree lists its artifacts.
    await expect(page.getByText('React Expert').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skills 4' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agents 1' })).toBeVisible()

    // A clean starter reports no problems.
    await expect(page.getByText('No findings. This Blueprint is clean.')).toBeVisible()
  })

  test('a project reopens from the recent list', async ({ page }) => {
    await openStarter(page)
    await page.goto('/')

    const recent = page.getByRole('button', { name: /React Expert.*artifacts/s })
    await expect(recent).toBeVisible()
    await recent.click()
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
  })
})

test.describe('workspace layout', () => {
  test('renders at 1280x800 without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openStarter(page)
    await expectNoHorizontalScroll(page)
  })

  test('renders at 1024x700 without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 })
    await openStarter(page)
    await expectNoHorizontalScroll(page)
  })

  test('selecting an artifact shows it in the canvas and the inspector', async ({ page }) => {
    await openStarter(page)

    await page.getByRole('button', { name: 'React testing' }).click()
    await expect(page.getByRole('button', { name: 'React testing' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(page.getByText('Nothing to report for this artifact.')).toBeVisible()
  })

  test('shows the health bar with the artifact count and the targets', async ({ page }) => {
    await openStarter(page)

    await expect(page.getByText(/\d+ artifacts/)).toBeVisible()
    await expect(page.getByText('claude-code')).toBeVisible()
    await expect(page.getByText('codex')).toBeVisible()
    await expect(page.getByText(/Health\s*\d+/)).toBeVisible()
  })

  test('editing an artifact saves it and survives a reload', async ({ page }) => {
    await openStarter(page)
    await page.getByRole('button', { name: 'React testing' }).click()

    const description = page.getByLabel('Description')
    await description.fill('Testing components by role and label.')

    // The change is unsaved, then autosave commits it without being asked.
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.reload()
    await page.getByRole('button', { name: 'React testing' }).click()
    await expect(page.getByLabel('Description')).toHaveValue(
      'Testing components by role and label.',
    )
  })

  test('renaming an artifact updates the agent that uses it', async ({ page }) => {
    await openStarter(page)
    await page.getByRole('button', { name: 'Accessibility' }).click()

    await page.getByLabel('Id').fill('a11y')
    await page.getByRole('button', { name: 'Rename' }).click()

    // The agent's skill picker now shows the new id as selected.
    await page.getByRole('button', { name: 'React Expert', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Accessibility', pressed: true })).toBeVisible()
    // And nothing broke: no dangling reference is reported.
    await expect(page.getByText('BP-REF-001')).toHaveCount(0)
  })

  test('an unknown project id explains itself instead of hanging', async ({ page }) => {
    await page.goto('/p/does-not-exist')
    await expect(page.getByRole('heading', { name: /could not be opened/ })).toBeVisible()
    await page.getByRole('link', { name: 'Back to all projects' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Design once')
  })
})
