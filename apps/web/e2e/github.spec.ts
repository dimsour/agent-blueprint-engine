import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { expect, type Page, test } from '@playwright/test'

/**
 * Opening a Blueprint that lives in a repository, against a GitHub that is not there.
 *
 * Every request to `api.github.com` is answered locally, so this exercises the real path —
 * token, tree, blobs, the import preview, storage — without an account, a network or a rate
 * limit. What it proves is the join: that a repository read this way becomes an ordinary local
 * project, with its diagnostics shown before anything is stored.
 */

const REPOSITORY: Record<string, string> = {
  ...readFixtureFiles('dotnet-testing-expert'),
  // Compiled output, which must not come back as part of the project.
  'CLAUDE.md': '# Compiled from the Blueprint\n',
  '.claude/skills/example/SKILL.md': '# Compiled\n',
}

const PATHS = Object.keys(REPOSITORY).sort()
const shaOf = (path: string) => `sha-${PATHS.indexOf(path)}`

async function mockGitHub(page: Page): Promise<void> {
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url()

    if (url.endsWith('/repos/octocat/blueprints')) {
      return route.fulfill({
        json: {
          name: 'blueprints',
          full_name: 'octocat/blueprints',
          private: false,
          default_branch: 'main',
          description: null,
          owner: { login: 'octocat' },
          permissions: { push: true },
        },
      })
    }
    if (url.includes('/git/ref/heads/main')) {
      return route.fulfill({ json: { object: { sha: 'head' } } })
    }
    if (url.includes('/git/trees/')) {
      return route.fulfill({
        json: {
          sha: 'tree',
          truncated: false,
          tree: PATHS.map((path) => ({
            path,
            type: 'blob',
            sha: shaOf(path),
            size: (REPOSITORY[path] ?? '').length,
          })),
        },
      })
    }
    if (url.includes('/git/blobs/')) {
      const sha = url.split('/git/blobs/')[1] ?? ''
      const path = PATHS.find((entry) => shaOf(entry) === sha) ?? ''
      return route.fulfill({
        json: {
          content: Buffer.from(REPOSITORY[path] ?? '', 'utf8').toString('base64'),
          encoding: 'base64',
        },
      })
    }
    return route.fulfill({ json: [] })
  })
}

test.describe('opening from GitHub', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHub(page)
    // The token lives where the credentials module puts it, and nowhere else.
    await page.addInitScript(() => {
      sessionStorage.setItem('ab:credentials:github', 'ghp_pretend')
    })
  })

  test('reads a repository, reports what is in it, and opens it as a local project', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open from GitHub' }).click()

    await page.getByLabel('Repository').fill('octocat/blueprints')
    await page.getByRole('button', { name: 'Read the repository' }).click()

    // The same preview a ZIP gets: what was found, before anything is stored.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/on main/)).toBeVisible()
    await expect(dialog.getByText(/agents/)).toBeVisible()

    await dialog.getByRole('button', { name: 'Open project' }).click()

    await page.waitForURL(/\/p\//)
    await expect(page.getByRole('navigation', { name: 'Blueprint artifacts' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export' }).first()).toBeEnabled()
  })

  test('says what is wrong rather than opening an empty project', async ({ page }) => {
    await page.route('https://api.github.com/**', (route) => {
      const url = route.request().url()
      if (url.includes('/git/trees/')) {
        return route.fulfill({ json: { sha: 'tree', truncated: false, tree: [] } })
      }
      if (url.includes('/git/ref/heads/main'))
        return route.fulfill({ json: { object: { sha: 'x' } } })
      return route.fulfill({
        json: {
          default_branch: 'main',
          owner: { login: 'octocat' },
          name: 'empty',
          full_name: 'octocat/empty',
          private: false,
          description: null,
        },
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Open from GitHub' }).click()
    await page.getByLabel('Repository').fill('octocat/empty')
    await page.getByRole('button', { name: 'Read the repository' }).click()

    await expect(page.getByRole('alert')).toContainText('blueprint/blueprint.yaml')
  })
})
