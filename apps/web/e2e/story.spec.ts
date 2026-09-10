/**
 * The story in docs/00, walked once (P8-09).
 *
 * Every other spec tests a surface. This one tests the *join*: begin from a template, see the
 * graph, edit an artifact, validate, save, compile, push. Each step is covered elsewhere in
 * isolation, and a product can pass all of those and still not hold together — a save that
 * loses the edit, an export that disagrees with the screen, a push whose preview is not what
 * gets committed. That is what this catches.
 *
 * It also checks the promises docs/00 makes under "Quality bar", because a promise nothing
 * asserts is a promise that quietly stops being true:
 *
 *   - a score's count is never a number without findings behind it
 *   - saving twice changes nothing
 *   - every harness limitation is explained, never silently dropped
 *
 * GitHub is answered locally. The point is not that the network works; it is that the commit
 * carries exactly what the preview said it would.
 */
import { expect, type Page, test } from '@playwright/test'

interface Committed {
  tree: { path: string; content?: string; sha?: string | null }[]
  message: string
  branch: string
}

/**
 * A repository that exists, on a branch that does not, so the push writes the first commit.
 * Records the tree it was given, which is the only way to check the preview told the truth.
 */
async function mockGitHub(page: Page, committed: Committed): Promise<void> {
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    const body = route.request().postDataJSON() as Record<string, unknown> | null

    if (url.endsWith('/user')) return route.fulfill({ json: { login: 'octocat' } })
    if (url.endsWith('/repos/octocat/blueprints')) {
      return route.fulfill({
        json: {
          name: 'blueprints',
          full_name: 'octocat/blueprints',
          default_branch: 'main',
          owner: { login: 'octocat' },
          permissions: { push: true },
        },
      })
    }
    // The branch does not exist yet: the first push creates it.
    if (url.includes('/git/ref/heads/')) {
      return route.fulfill({ status: 404, json: { message: 'Not Found' } })
    }
    if (url.includes('/branches')) {
      return route.fulfill({ json: [{ name: 'main', commit: { sha: 'head' } }] })
    }
    if (url.endsWith('/git/trees') && method === 'POST') {
      committed.tree = (body?.tree ?? []) as Committed['tree']
      return route.fulfill({ json: { sha: 'new-tree' } })
    }
    if (url.endsWith('/git/commits') && method === 'POST') {
      committed.message = String(body?.message ?? '')
      return route.fulfill({
        json: { sha: 'new-commit', html_url: 'https://github.test/commit/new-commit' },
      })
    }
    if (url.endsWith('/git/refs') && method === 'POST') {
      committed.branch = String(body?.ref ?? '')
      return route.fulfill({ json: { ref: body?.ref } })
    }
    return route.fulfill({ json: [] })
  })
}

test.describe('the end-to-end story', () => {
  test('template, edit, validate, save, compile, push', async ({ page }) => {
    const committed: Committed = { tree: [], message: '', branch: '' }
    await mockGitHub(page, committed)
    await page.addInitScript(() => {
      sessionStorage.setItem('ab:credentials:github', 'ghp_pretend')
    })

    // 1. Start. The dashboard offers every way in.
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Create Blueprint' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import ZIP' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open from GitHub' })).toBeVisible()

    // 2. Begin from a template. (The AI draft is the same path with an endpoint configured;
    // there is no endpoint here, and a test that mocks one would be testing the mock.)
    await page.getByRole('button', { name: /React Expert/ }).click()
    await page.waitForURL(/\/p\//)
    const tree = page.getByRole('navigation', { name: 'Blueprint artifacts' })
    await expect(tree).toBeVisible()

    // 3. See the graph. Derived from typed references, not from stored layout.
    await expect(page.locator('.react-flow__node').first()).toBeVisible()

    // 4. Edit an artifact.
    await tree.getByRole('button', { name: /^React testing(,|$)/ }).click()
    await page
      .getByLabel('Description', { exact: true })
      .fill('Testing components by role and label, never by implementation detail.')

    // 5. Save. Autosave commits it without being asked.
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })

    // 6. Validate. A count in the health bar always has findings behind it: "a number
    // without a finding is a bug" (docs/00).
    for (const severity of ['errors', 'warnings'] as const) {
      const button = page.getByRole('button', { name: new RegExp(`^\\d+ ${severity}$`) })
      const count = Number((await button.getAttribute('aria-label'))?.split(' ')[0] ?? '0')
      if (count === 0) {
        await expect(button, `${severity} count is zero`).toBeDisabled()
        continue
      }
      await button.click()
      await expect(
        page.getByRole('list', { name: `${severity.slice(0, -1)} findings` }).getByRole('listitem'),
      ).toHaveCount(count)
      await page.keyboard.press('Escape')
    }

    // 7. Compile. The export view shows what would be written, per target, before it is.
    await tree.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(page).toHaveURL(/view=export/)
    await expect(page.getByRole('list', { name: 'Claude Code files' })).toContainText('CLAUDE.md')

    // The edit reaches the compiled output: the screen is rendered from the Blueprint in the
    // store, so an export cannot show a version of the project that was never saved.
    await page.getByRole('button', { name: '.claude/skills/react-testing/SKILL.md' }).click()
    await expect(page.getByText(/never by implementation detail/)).toBeVisible()

    // 8. Every harness limitation is explained, never silently dropped (docs/00).
    await tree.getByRole('button', { name: 'Compatibility', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Compile targets' })).toBeVisible()
    const notes = page.getByRole('list', { name: 'Compatibility notes' })
    await expect(notes.getByRole('listitem').first()).toBeVisible()

    // 9. Push. The preview names every path; the commit carries exactly those.
    await page.getByRole('button', { name: 'GitHub', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Repository').fill('octocat/blueprints')
    await dialog.getByLabel('Branch').fill('blueprint')
    await dialog.getByRole('button', { name: 'Preview the changes' }).click()

    const changes = dialog.getByRole('list', { name: 'Changes' })
    await expect(changes).toBeVisible()
    const previewed = (await changes.getByRole('listitem').allInnerTexts())
      // Each row is a kind badge ("new", "changed") and then the path.
      .map((text) => text.split('\n').at(-1)?.trim() ?? '')
      .filter(Boolean)
      .sort()
    expect(previewed).toContain('blueprint/blueprint.yaml')
    expect(previewed).toContain('CLAUDE.md')

    await dialog.getByRole('button', { name: /Push/ }).click()
    await expect(dialog.getByRole('link', { name: /See it on GitHub/ })).toBeVisible()

    // What was previewed is what was committed, in one commit, on the branch that was named.
    expect(committed.tree.map((item) => item.path).sort()).toEqual(previewed)
    expect(committed.branch).toBe('refs/heads/blueprint')

    // 10. Use. The commit is a repository a harness can read: the root instruction file, the
    // skills, and the workflow as a slash command.
    const paths = committed.tree.map((item) => item.path)
    expect(paths).toContain('CLAUDE.md')
    expect(paths).toContain('.claude/skills/build-component/SKILL.md')
    expect(paths).toContain('AGENTS.md')
    // And the source it was compiled from, so the repository can be opened again.
    expect(paths.some((path) => path.startsWith('blueprint/skills/'))).toBe(true)
  })

  test('saving twice changes nothing', async ({ page }) => {
    // docs/00: "Saving twice changes nothing." Deterministic output is the claim the whole
    // compiler rests on, and this is the user-visible half of it.
    await page.goto('/')
    await page.getByRole('button', { name: /React Expert/ }).click()
    await page.waitForURL(/\/p\//)
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()

    const download = async (): Promise<string[]> => {
      await page
        .getByRole('navigation', { name: 'Blueprint artifacts' })
        .getByRole('button', { name: 'Export', exact: true })
        .click()
      const started = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download', exact: true }).click()
      const file = await started
      const { readFile } = await import('node:fs/promises')
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(await readFile((await file.path()) ?? ''))
      const entries = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir)
      return Promise.all(
        entries.sort().map(async (name) => `${name}\n${await zip.files[name]?.async('string')}`),
      )
    }

    const first = await download()
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
    const second = await download()

    expect(second).toEqual(first)
  })
})

/**
 * docs/07: "`?view=` and `&id=` make an artifact linkable."
 *
 * Clicking a link and reloading one are the same URL, and until P8-09 they were not the same
 * outcome: the store's default view won a race against the URL, so a link to a report or an
 * artifact survived being clicked and not being reloaded or shared.
 */
test.describe('a linkable view', () => {
  for (const target of [
    { label: 'Export', expect: /view=export/ },
    { label: 'Evaluation', expect: /view=evaluation/ },
  ]) {
    test(`${target.label} survives a reload`, async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: /React Expert/ }).click()
      await page.waitForURL(/\/p\//)
      const tree = page.getByRole('navigation', { name: 'Blueprint artifacts' })
      await expect(tree).toBeVisible()

      await tree.getByRole('button', { name: target.label, exact: true }).click()
      await expect(page).toHaveURL(target.expect)

      await page.reload()
      await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
      await expect(page).toHaveURL(target.expect)
    })
  }

  test('an artifact link survives a reload', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /React Expert/ }).click()
    await page.waitForURL(/\/p\//)
    const tree = page.getByRole('navigation', { name: 'Blueprint artifacts' })
    await expect(tree).toBeVisible()

    await tree.getByRole('button', { name: /^React testing(,|$)/ }).click()
    await expect(page).toHaveURL(/view=skills&id=react-testing/)

    await page.reload()
    await expect(page).toHaveURL(/view=skills&id=react-testing/)
    // Not just the URL: the artifact is actually the one open.
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
      'React testing',
    )
  })
})
