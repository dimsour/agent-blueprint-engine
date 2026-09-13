/**
 * The dialog that publishes a project.
 *
 * Every test here is about a refusal, because the refusals are the feature. Nothing is pushed
 * before it has been previewed; a file this app did not write is not overwritten silently; a
 * credential in the content stops the push until somebody says otherwise; and a branch that
 * already has this Blueprint offers nothing to press.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CHANGE_BADGES, PushDialog } from '@/components/github/push-dialog'
import { byteLength, encodeUtf8, type ProjectFile, toBase64 } from '@agent-blueprint/core'

import { gitBlobSha } from '@/lib/github/tree'
import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const realFetch = globalThis.fetch

/** What GitHub answers. Repository and branches exist; the tree is empty unless one is given. */
async function github(
  options: {
    tree?: { path: string; content: ProjectFile }[]
    missingUntilCreated?: boolean
    /** No commits at all, on any branch — what a repository created a moment ago is. */
    empty?: boolean
  } = {},
): Promise<{
  requests: { method: string; url: string; body: Record<string, unknown> }[]
}> {
  const requests: { method: string; url: string; body: Record<string, unknown> }[] = []
  const files = options.tree ?? []
  const shas = new Map<string, string>()
  for (const file of files) shas.set(file.path, await gitBlobSha(file.content))
  let exists = !options.missingUntilCreated
  /** Whether the repository has any commit. GitHub's git-data endpoints refuse until it does. */
  let hasCommits = !(options.empty ?? options.missingUntilCreated ?? false)

  globalThis.fetch = vi.fn((url: URL, init: RequestInit = {}) => {
    const path = String(url)
    const method = init.method ?? 'GET'
    requests.push({
      method,
      url: path,
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    })

    if (
      path.endsWith(
        '/user/repos?affiliation=owner%2Ccollaborator%2Corganization_member&sort=updated&per_page=100',
      )
    ) {
      return Promise.resolve(Response.json([]))
    }
    if (path.endsWith('/user/repos') && method === 'POST') {
      exists = true
      return Promise.resolve(
        Response.json({
          name: 'blueprints',
          full_name: 'octocat/blueprints',
          default_branch: 'main',
          owner: { login: 'octocat' },
        }),
      )
    }
    if (path.endsWith('/user')) return Promise.resolve(Response.json({ login: 'octocat' }))
    if (path.endsWith('/repos/octocat/blueprints')) {
      if (!exists) return Promise.resolve(Response.json({ message: 'Not Found' }, { status: 404 }))
      return Promise.resolve(
        Response.json({
          name: 'blueprints',
          full_name: 'octocat/blueprints',
          private: false,
          default_branch: 'main',
          description: null,
          size: files.length,
          owner: { login: 'octocat' },
          permissions: { push: true },
        }),
      )
    }
    if (path.includes('/branches'))
      return Promise.resolve(Response.json([{ name: 'main', commit: { sha: 'head' } }]))
    const empty = () =>
      Promise.resolve(Response.json({ message: 'Git Repository is empty.' }, { status: 409 }))
    if (path.includes('/git/ref/heads/') && method === 'GET') {
      // What GitHub actually says for a repository with no commits: 409, not 404. The
      // dialog used to fail the preview with this sentence on a repository it had itself
      // just created (P9-23). A repository with commits but not this branch says 404.
      if (!hasCommits) return empty()
      return files.length === 0
        ? Promise.resolve(Response.json({ message: 'Not Found' }, { status: 404 }))
        : Promise.resolve(Response.json({ object: { sha: 'head' } }))
    }
    // The Contents API is the one way to make the first commit (P9-24).
    if (path.includes('/contents/') && method === 'PUT') {
      hasCommits = true
      return Promise.resolve(Response.json({ commit: { sha: 'seed' } }))
    }
    // And every git-data write refuses until then, which is the bug this reproduces.
    if (!hasCommits && method === 'POST' && /\/git\/(trees|commits|refs)$/.test(path)) {
      return empty()
    }
    if (path.includes('/git/trees/')) {
      return Promise.resolve(
        Response.json({
          sha: 'tree',
          truncated: false,
          tree: files.map((file) => ({
            path: file.path,
            type: 'blob',
            sha: shas.get(file.path),
            size: byteLength(file.content),
          })),
        }),
      )
    }
    if (path.includes('/git/blobs/')) {
      const sha = path.split('/git/blobs/')[1] ?? ''
      const file = files.find((entry) => shas.get(entry.path) === sha)
      return Promise.resolve(
        Response.json({
          content: toBase64(encodeUtf8(String(file?.content ?? ''))),
          encoding: 'base64',
        }),
      )
    }
    if (path.includes('/git/commits/'))
      return Promise.resolve(Response.json({ tree: { sha: 'tree' } }))
    if (path.endsWith('/git/trees')) return Promise.resolve(Response.json({ sha: 'new-tree' }))
    if (path.endsWith('/git/commits')) {
      return Promise.resolve(
        Response.json({ sha: 'new-commit', html_url: 'https://github.test/c' }),
      )
    }
    return Promise.resolve(Response.json({ ref: 'refs/heads/main' }))
  }) as unknown as typeof globalThis.fetch

  return { requests }
}

async function load() {
  const { blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert'))
  useWorkspace.getState().load('test', blueprint)
  return blueprint
}

async function openDialog(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<PushDialog open onOpenChange={vi.fn()} />)
  return user
}

/** Puts a line into the first agent's persona, which reaches the compiled files as well. */
function withSecret(blueprint: Awaited<ReturnType<typeof load>>, line: string): void {
  const [first, ...rest] = blueprint.agents
  if (!first) throw new Error('The fixture has no agents.')
  useWorkspace.getState().load('test', {
    ...blueprint,
    agents: [{ ...first, body: `${first.body}\n\n${line}\n` }, ...rest],
  })
}

async function chooseRepository(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Repository'), 'octocat/blueprints')
  await user.click(screen.getByRole('button', { name: 'Preview the changes' }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useWorkspace.getState().close()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('the change tags', () => {
  it('use the colours a diff reads by', () => {
    expect(CHANGE_BADGES.add).toEqual({ label: 'new', variant: 'success' })
    expect(CHANGE_BADGES.update).toEqual({ label: 'changed', variant: 'warning' })
    expect(CHANGE_BADGES.delete).toEqual({ label: 'removed', variant: 'danger' })
  })
})

describe('pushing to GitHub', () => {
  it('asks for a token before anything else', async () => {
    await load()
    await github()
    await openDialog()

    expect(screen.getByText(/not holding a GitHub token/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Push' })).not.toBeInTheDocument()
  })

  it('will not push before the changes have been looked at', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    await load()
    await github()
    const user = await openDialog()

    await user.type(screen.getByLabelText('Repository'), 'octocat/blueprints')

    expect(screen.getByRole('button', { name: /Push/ })).toBeDisabled()
  })

  it('lists every file the commit would carry, then pushes them as one', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    await load()
    const { requests } = await github()
    const user = await openDialog()

    await chooseRepository(user)

    const changes = await screen.findByRole('list', { name: 'Changes' })
    expect(within(changes).getByText('blueprint/blueprint.yaml')).toBeInTheDocument()
    expect(within(changes).getByText('CLAUDE.md')).toBeInTheDocument()
    // Every file is new to an empty repository, and the tag says so in the colour a diff uses.
    const tags = within(changes).getAllByText('new')
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) expect(tag.className).toContain('text-success')

    await user.click(screen.getByRole('button', { name: /Push/ }))

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /See it on GitHub/ })).toBeInTheDocument(),
    )
    const writes = requests.filter(
      (request) => request.method === 'POST' && request.url.endsWith('/git/trees'),
    )
    expect(writes).toHaveLength(1)
    expect(requests.filter((request) => request.url.endsWith('/git/commits')).length).toBe(1)
  })

  it('says how to install what it pushed, when it pushed a plugin', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    const blueprint = await load()
    useWorkspace.getState().load('test', {
      ...blueprint,
      targets: [{ harnessId: 'claude-code', enabled: true, options: { layout: 'plugin' } }],
    })
    const { requests } = await github()
    const user = await openDialog()
    await chooseRepository(user)
    const changes = await screen.findByRole('list', { name: 'Changes' })
    expect(within(changes).getByText('.claude-plugin/marketplace.json')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Push/ }))
    await screen.findByRole('link', { name: /See it on GitHub/ })

    // The exact commands, with the repository this dialog pushed to.
    expect(screen.getByText(/Install it in Claude Code/)).toBeInTheDocument()
    expect(document.body.textContent).toContain('/plugin marketplace add octocat/blueprints')
    expect(document.body.textContent).toContain(
      '/plugin install dotnet-testing-expert@dotnet-testing-expert',
    )
    // And the README that went up names this repository in its own install commands (P9-33),
    // rather than a placeholder the reader has to fill in.
    const tree = requests.find((r) => r.method === 'POST' && r.url.endsWith('/git/trees'))
    const readme = (tree?.body.tree as { path: string; content?: string }[]).find(
      (item) => item.path === 'README.md',
    )
    expect(readme?.content).toContain('/plugin marketplace add octocat/blueprints')
    expect(readme?.content).not.toContain('<owner>/<repo>')
  })

  it('counts an accepted conflict as one more file in the commit', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    await load()
    await github({ tree: [{ path: 'CLAUDE.md', content: '# Written by hand, long ago\n' }] })
    const user = await openDialog()

    await chooseRepository(user)
    await screen.findByRole('list', { name: 'Changes' })
    const before = Number(/(\d+) files in one commit/.exec(document.body.textContent ?? '')?.[1])

    await user.click(screen.getByRole('checkbox', { name: /CLAUDE\.md/ }))

    const after = Number(/(\d+) files in one commit/.exec(document.body.textContent ?? '')?.[1])
    expect(after).toBe(before + 1)
  })

  it('offers to make a repository that is not there, and previews against the new one', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    await load()
    const { requests } = await github({ missingUntilCreated: true })
    const user = await openDialog()

    await chooseRepository(user)
    await screen.findByRole('button', { name: /Create octocat\/blueprints/ })

    await user.click(screen.getByRole('button', { name: /Create octocat\/blueprints/ }))

    await screen.findByRole('list', { name: 'Changes' })
    const created = requests.find(
      (request) => request.url.endsWith('/user/repos') && request.method === 'POST',
    )
    expect(created?.body).toMatchObject({ name: 'blueprints', private: true, auto_init: false })
  })

  it('has nothing to offer when the branch already holds this Blueprint', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    const blueprint = await load()
    const { planPush, writesFor } = await import('@/lib/github/plan')
    const plan = await planPush(blueprint, undefined)
    const { writes } = writesFor(plan)

    await github({ tree: Object.entries(writes).map(([path, content]) => ({ path, content })) })
    // The tree stub answers one blob for every path, so hashes are compared rather than bodies;
    // priming settles them all as identical because the content is exactly what we would write.
    const user = await openDialog()
    await chooseRepository(user)

    expect(await screen.findByText(/Nothing to push/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Push/ })).toBeDisabled()
  })

  it('refuses while something in the files looks like a credential', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    const blueprint = await load()
    withSecret(blueprint, 'Use AKIAIOSFODNN7EXAMPLE when deploying.')
    await github()
    const user = await openDialog()

    await chooseRepository(user)

    expect(await screen.findByText(/looks like a credential/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Push/ })).toBeDisabled()

    // One pasted key becomes several findings: the artifact that carries it, and every file
    // compiled from that artifact. Each is ticked on its own, because each is a separate
    // decision to publish it, and the push stays blocked until the last one is.
    const findings = screen.getAllByRole('checkbox', { name: /AWS access key/ })
    expect(findings.length).toBeGreaterThan(1)
    for (const finding of findings.slice(0, -1)) {
      await user.click(finding)
      expect(screen.getByRole('button', { name: /Push/ })).toBeDisabled()
    }
    await user.click(findings.at(-1)!)
    expect(screen.getByRole('button', { name: /Push/ })).toBeEnabled()
  })

  it('never shows the credential it found', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    const blueprint = await load()
    withSecret(blueprint, 'key: sk-abcdefghijklmnopqrstuvwxyz01')
    await github()
    const user = await openDialog()

    await chooseRepository(user)

    await screen.findByText(/looks like a credential/)
    expect(document.body.textContent).not.toContain('sk-abcdefghijklmnopqrstuvwxyz01')
  })
})

/**
 * A new repository, as an option rather than a consolation (P9-22).
 *
 * Reported from use: "is it possible to add an option to create a new repo?" It was — after a
 * preview had failed with a 404, which is not where anyone looks for an option.
 */
describe('creating the repository', () => {
  it('offers to create a name the token cannot see, before any preview', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    await load()
    const { requests } = await github({ missingUntilCreated: true })
    const user = await openDialog()

    // Typed, not previewed: the offer is there as soon as the name is.
    await user.type(screen.getByLabelText('Repository'), 'octocat/blueprints')
    const create = await screen.findByRole('button', { name: /Create octocat\/blueprints/ })
    expect(create).toBeVisible()
    // And Preview stays beside it, because the list is what the token can see, not everything.
    expect(screen.getByRole('button', { name: 'Preview the changes' })).toBeEnabled()

    await user.click(create)
    await screen.findByRole('list', { name: 'Changes' })
    expect(
      requests.some((request) => request.url.endsWith('/user/repos') && request.method === 'POST'),
    ).toBe(true)
  })

  it('names a new repository for the Blueprint under the token’s own login, in one click', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    const blueprint = await load()
    await github({ missingUntilCreated: true })
    const user = await openDialog()

    await user.click(await screen.findByRole('button', { name: /New repository: octocat\// }))
    expect(screen.getByLabelText('Repository')).toHaveValue(`octocat/${blueprint.id}`)
  })
})

/**
 * The first commit (P9-23).
 *
 * Reported from use, on a repository the dialog had just created: "Git Repository is empty."
 * GitHub answers the ref endpoints of a repository with no commits with 409 and that sentence,
 * and the client treated every 409 as a conflict. To a preview, an empty repository is the one
 * case with nothing to compare against — the push is simply the first commit.
 */
describe('pushing to an empty repository', () => {
  it('previews against nothing and pushes a commit with no parent', async () => {
    sessionStorage.setItem('ab:credentials:github', 'ghp_token')
    await load()
    const { requests } = await github({ missingUntilCreated: true })
    const user = await openDialog()

    await user.type(screen.getByLabelText('Repository'), 'octocat/blueprints')
    await user.click(await screen.findByRole('button', { name: 'Create octocat/blueprints' }))

    // The preview ran against the empty repository and listed everything as an addition.
    await screen.findByRole('list', { name: 'Changes' })
    expect(screen.queryByRole('alert')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Push' }))
    await screen.findByRole('link', { name: /See it on GitHub/ })

    // GitHub refused the first tree, so one file went in through the Contents API to make the
    // repository non-empty; then the whole tree, as a root commit; then the branch moved onto
    // it with force, leaving one commit in the history rather than two.
    const methods = requests
      .filter(
        (request) =>
          request.method !== 'GET' &&
          (request.url.includes('/git/') || request.url.includes('/contents/')),
      )
      .map((request) => `${request.method} ${request.url.split('/repos/octocat/blueprints')[1]}`)
    expect(methods[0]).toBe('POST /git/trees') // refused: the repository was empty
    expect(methods[1]?.startsWith('PUT /contents/')).toBe(true) // the seed
    expect(methods.slice(2)).toEqual([
      'POST /git/trees',
      'POST /git/commits',
      'PATCH /git/refs/heads/main',
    ])
    const commit = requests.find(
      (request) => request.url.endsWith('/git/commits') && request.method === 'POST',
    )
    expect(commit?.body).toMatchObject({ parents: [] })
    const moved = requests.find(
      (request) => request.url.endsWith('/git/refs/heads/main') && request.method === 'PATCH',
    )
    expect(moved?.body).toMatchObject({ sha: 'new-commit', force: true })
  })
})
