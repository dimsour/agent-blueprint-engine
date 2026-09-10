/**
 * The README's screenshots, generated (P8-08).
 *
 * Hand-captured screenshots go stale silently: the UI changes, the picture does not, and
 * nobody notices until a reader is confused by it. These are produced by a script, so
 * refreshing them is one command rather than an afternoon:
 *
 *   pnpm --filter web screenshots
 *
 * Not part of `test:e2e`: it is excluded by the `screenshots` grep in that script, because
 * writing files into the repository is not something a test run should do.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

const IMAGES = join(process.cwd(), '..', '..', 'docs', 'images')

async function shoot(page: Page, name: string): Promise<void> {
  const path = join(IMAGES, `${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path })
}

test.describe('screenshots', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('capture', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await shoot(page, 'dashboard')

    await page.getByRole('button', { name: /React Expert/ }).click()
    await page.waitForURL(/\/p\//)
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
    // The overview lands on the graph, which lays itself out; shooting before it settles
    // captures the spinner, which is what a hand-captured screenshot would never admit to.
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    await shoot(page, 'workspace')

    const tree = page.getByRole('navigation', { name: 'Blueprint artifacts' })
    await tree.getByRole('button', { name: /^React rendering(,|$)/ }).click()
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
      'React rendering',
    )
    await shoot(page, 'artifact-editor')

    await tree.getByRole('button', { name: 'Overview', exact: true }).click()
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    await shoot(page, 'overview-graph')

    await tree.getByRole('button', { name: 'Evaluation', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Dimension scores' })).toBeVisible()
    await shoot(page, 'evaluation')

    await tree.getByRole('button', { name: 'Compatibility', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Compile targets' })).toBeVisible()
    await shoot(page, 'compatibility')
  })
})
