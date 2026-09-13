/**
 * Every picture the product shows of itself, generated (P8-08, extended in P9-06).
 *
 * Hand-captured screenshots go stale silently: the UI changes, the picture does not, and
 * nobody notices until a reader is confused by it. These are produced by a script, so
 * refreshing them is one command rather than an afternoon:
 *
 *   pnpm --filter web screenshots
 *
 * They land in `src/assets/screenshots` rather than in `docs/`, because the app is the main
 * reader now: `/tutorial` imports them through `next/image`, and the README links the same
 * files. One set, one command, and a tutorial that cannot show a version of the app that no
 * longer exists.
 *
 * Not part of `test:e2e`: it is its own Playwright project, because writing files into the
 * repository is not something a test run should do.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

const IMAGES = join(process.cwd(), 'src', 'assets', 'screenshots')

async function shoot(page: Page, name: string): Promise<void> {
  const path = join(IMAGES, `${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, animations: 'disabled' })
}

const tree = (page: Page) => page.getByRole('navigation', { name: 'Blueprint artifacts' })

test.describe('screenshots', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('capture', async ({ page }) => {
    // 1 · Start.
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await shoot(page, 'dashboard')

    // 2 · Describe. Filled in, because an empty form shows nothing about what it wants.
    await page.goto('/new')
    await page.getByLabel('Name', { exact: true }).fill('Rust Review Crew')
    await page
      .getByLabel('Description', { exact: true })
      .fill('Reviews Rust changes for unsafe blocks before they merge.')
    await expect(page.getByLabel('Id', { exact: true })).toHaveValue('rust-review-crew')
    await shoot(page, 'new-project')

    // The rest of the story needs a Blueprint with something in it, which is what the
    // starters are for; the tutorial says so rather than implying this came from step 2.
    await page.goto('/')
    await page.getByRole('button', { name: /React Expert/ }).click()
    await page.waitForURL(/\/p\//)
    await expect(tree(page)).toBeVisible()
    // The overview lands on the graph, which lays itself out; shooting before it settles
    // captures the spinner, which is what a hand-captured screenshot would never admit to.
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    await shoot(page, 'workspace')

    // 3 · Review. A template rather than a model, because a model needs an endpoint and a
    // reader of the tutorial may not have one — but it is the same bargain: what it would
    // create, shown before it creates it.
    await tree(page)
      .getByRole('button', { name: /^React rendering(,|$)/ })
      .click()
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
      'React rendering',
    )
    await shoot(page, 'artifact-editor')

    await page.getByRole('button', { name: 'New from template' }).click()
    const template = page.getByRole('dialog')
    await expect(template).toBeVisible()
    await template.getByRole('radio').first().click()
    await template.getByLabel('Name', { exact: true }).fill('Bundle Budget')
    await expect(template).toContainText('bundle-budget')
    await shoot(page, 'template-review')
    await page.keyboard.press('Escape')
    await expect(template).toHaveCount(0)

    // 4 · See the graph.
    await tree(page).getByRole('button', { name: 'Overview', exact: true }).click()
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    await shoot(page, 'overview-graph')

    // 5 · Connect.
    await tree(page)
      .getByRole('button', { name: /^Build a Component(,|$)/ })
      .click()
    await expect(page.getByRole('tab', { name: /Graph/ })).toHaveAttribute('data-state', 'active')
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    // Zoomed in, because nine steps fitted to the pane are nine illegible rectangles and the
    // step names are the whole point; and with one selected, because a step and what comes
    // after it is what this editor is for — and it puts the panel over the empty canvas
    // where the "drag between two steps" hint would otherwise sit across a node.
    await page.locator('.react-flow__controls-zoomin').click()
    await page.locator('.react-flow__controls-zoomin').click()
    await page.locator('.react-flow__node').nth(3).click()
    await expect(page.getByRole('complementary', { name: 'Step settings' })).toBeVisible()
    await shoot(page, 'workflow-editor')

    // 6 · Improve. Without an endpoint the assistant says what it would offer and where to
    // configure one, which is the honest picture for a reader who has not set one up either.
    await page.getByRole('button', { name: /^AI/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Assistant')
    await shoot(page, 'assistant')
    await page.keyboard.press('Escape')

    // 7 · Validate. A finding to open: clearing a description makes one on demand rather
    // than hoping the starter has one.
    await tree(page)
      .getByRole('button', { name: /^React testing(,|$)/ })
      .click()
    await page.getByLabel('Description', { exact: true }).fill('')
    const warnings = page.getByRole('button', { name: /warnings?$/ })
    await expect(warnings).toBeEnabled({ timeout: 10_000 })
    await warnings.click()
    await expect(page.getByRole('list', { name: 'warning findings' })).toBeVisible()
    await shoot(page, 'health-findings')
    await page.keyboard.press('Escape')

    // 8 · Save. The source tab is the file the project writes, so it is the honest picture
    // of what saving produces.
    await tree(page)
      .getByRole('button', { name: /^React rendering(,|$)/ })
      .click()
    await page.getByRole('tab', { name: /Markdown/ }).click()
    await expect(page.locator('.cm-content')).toBeVisible()
    await shoot(page, 'source-tab')

    // 9 · Compile.
    await tree(page).getByRole('button', { name: 'Export', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Claude Code files' })).toBeVisible()
    await shoot(page, 'export-view')

    await tree(page).getByRole('button', { name: 'Evaluation', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Dimension scores' })).toBeVisible()
    await shoot(page, 'evaluation')

    await tree(page).getByRole('button', { name: 'Compatibility', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Compile targets' })).toBeVisible()
    await shoot(page, 'compatibility')

    // 10 · Push. Without a token this is where the push begins, which is as far as a
    // screenshot can honestly go.
    await page.getByRole('banner').getByRole('button', { name: 'GitHub' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await shoot(page, 'github')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // The second half of the tutorial takes the parts one at a time, and the detail it
    // explains lives in the forms, so the pictures are of the forms: the agent's, down to
    // its permission grid, then a law, a hook and a gate from the same starter.
    const inspector = page.getByRole('complementary', { name: 'Inspector' })
    await tree(page)
      .getByRole('button', { name: /^React Expert(,|$)/ })
      .click()
    await expect(inspector).toContainText('React Expert')
    await shoot(page, 'agent-editor')

    // The grid sits far down the form. Its field is taller than the pane, so it is scrolled
    // to its top rather than merely into view, which would show only its last rows.
    await page
      .getByRole('columnheader', { name: 'Operation' })
      .evaluate((cell) => cell.closest('table')?.parentElement?.scrollIntoView({ block: 'start' }))
    await shoot(page, 'agent-permissions')

    await tree(page)
      .getByRole('button', { name: /^Never Fake Verification(,|$)/ })
      .click()
    await expect(inspector).toContainText('Never Fake Verification')
    await shoot(page, 'iron-law-editor')

    await tree(page)
      .getByRole('button', { name: /^Run tests after change(,|$)/ })
      .click()
    await expect(inspector).toContainText('Run tests after change')
    await shoot(page, 'hook-editor')

    await tree(page)
      .getByRole('button', { name: /^Tests must pass(,|$)/ })
      .click()
    await expect(inspector).toContainText('Tests must pass')
    await shoot(page, 'gate-editor')

    // The assistant and GitHub each get a part too, and the honest picture of each without
    // a key or a token is Settings: where the endpoint is chosen and where the token is
    // proved, one card each, scrolled to the card the part is about.
    await page.goto('/settings')
    await page
      .getByRole('heading', { name: 'AI endpoint' })
      .evaluate((heading) => heading.scrollIntoView({ block: 'start' }))
    await shoot(page, 'settings-ai')
    await page
      .getByRole('heading', { name: 'GitHub' })
      .evaluate((heading) => heading.scrollIntoView({ block: 'start' }))
    await shoot(page, 'settings-github')
  })
})
