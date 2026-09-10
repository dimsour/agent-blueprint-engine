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

import { PushDialog } from '@/components/github/push-dialog'
import { gitBlobSha } from '@/lib/github/tree'
import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const realFetch = globalThis.fetch

/** What GitHub answers. Repository and branches exist; the tree is empty unless one is given. */
async function github(options: { tree?: { path: string; content: string }[] } = {}): Promise<{
  requests: { method: string; url: string; body: Record<string, unknown> }[]
}> {
  const requests: { method: string; url: string; body: Record<string, unknown> }[] = []
  const files = options.tree ?? []
  const shas = new Map<string, string>()
  for (const file of files) shas.set(file.path, await gitBlobSha(file.content))

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
    if (path.endsWith('/repos/octocat/blueprints')) {
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
    if (path.includes('/git/ref/heads/')) {
      return files.length === 0
        ? Promise.resolve(Response.json({ message: 'Not Found' }, { status: 404 }))
        : Promise.resolve(Response.json({ object: { sha: 'head' } }))
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
            size: file.content.length,
          })),
        }),
      )
    }
    if (path.includes('/git/blobs/')) {
      const sha = path.split('/git/blobs/')[1] ?? ''
      const file = files.find((entry) => shas.get(entry.path) === sha)
      return Promise.resolve(
        Response.json({ content: btoa(file?.content ?? ''), encoding: 'base64' }),
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
