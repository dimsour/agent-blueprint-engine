/**
 * How the app feels on a Blueprint that is not small (P8-07).
 *
 * The core budgets are measured in `packages/core/tests/performance.test.ts`, where the
 * functions can be called directly. These are the ones only a browser can answer: a
 * 200-artifact project imported through the real path, its tree rendered, its graph drawn,
 * and a keystroke in an editor answered while all of that is on screen.
 *
 * The numbers are loose on purpose. A threshold that fails on a loaded machine gets disabled,
 * and a disabled test measures nothing; these catch a change in the shape of the cost.
 */
import { stressProjectFiles } from '@agent-blueprint/fixtures'
import { expect, type Page, test } from '@playwright/test'
import JSZip from 'jszip'

/** The stress project as a ZIP, so it arrives the way a real one does. */
async function stressArchive(): Promise<Buffer> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(stressProjectFiles({ artifacts: 200 }))) {
    zip.file(path, content, { date: new Date(0), createFolders: false })
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function openStressProject(page: Page): Promise<number> {
  await page.goto('/')
  await page.getByLabel('Import a Blueprint archive or manifest', { exact: true }).setInputFiles({
    name: 'stress.zip',
    mimeType: 'application/zip',
    buffer: await stressArchive(),
  })

  await expect(page.getByRole('dialog')).toBeVisible()
  const started = Date.now()
  await page.getByRole('button', { name: /Open project/ }).click()
  await page.waitForURL(/\/p\//)
  await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
  return Date.now() - started
}

test.describe('a 200-artifact project', () => {
  test('reads, stores and opens in under two seconds', async ({ page }) => {
    const elapsed = await openStressProject(page)
    expect(elapsed, `opened in ${elapsed}ms`).toBeLessThan(2000)

    // The whole project is there, not a truncated view of it.
    const tree = page.getByRole('navigation', { name: 'Blueprint artifacts' })
    await expect(tree.getByRole('button', { name: /^Skills/ })).toBeVisible()
  })

  test('draws the overview graph in under 500ms', async ({ page }) => {
    await openStressProject(page)

    const started = Date.now()
    await page
      .getByRole('navigation', { name: 'Blueprint artifacts' })
      .getByRole('button', { name: 'Overview', exact: true })
      .click()
    await expect(page.getByRole('group', { name: 'Filter by kind' })).toBeVisible()
    // The first node painted is when the graph is on screen, not when the view mounted.
    await expect(page.locator('.react-flow__node').first()).toBeVisible()

    const elapsed = Date.now() - started
    expect(elapsed, `drawn in ${elapsed}ms`).toBeLessThan(500)
  })

  test('answers a keystroke while the health bar is live', async ({ page }) => {
    await openStressProject(page)
    const tree = page.getByRole('navigation', { name: 'Blueprint artifacts' })
    await tree.getByRole('button', { name: /^Agent 1(,|$)/ }).click()

    const field = page.getByLabel('Description', { exact: true })
    await field.click()

    // Validation and the health score run off the same edit; a typed character must not wait
    // for either. Measured over ten, because one keystroke is inside the noise.
    const started = Date.now()
    await field.pressSequentially('performance', { delay: 0 })
    const elapsed = Date.now() - started

    await expect(field).toHaveValue(/performance/)
    expect(elapsed, `ten characters in ${elapsed}ms`).toBeLessThan(2000)
  })
})
