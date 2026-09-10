/**
 * Picking a destination.
 *
 * The interesting cases are the ones where GitHub's answer and the obvious assumption differ:
 * a repository you can see but not write to, an organisation's repositories that a default
 * listing hides, a repository with no commits whose default branch does not exist, and a second
 * page that only the `Link` header knows about.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createBranch,
  createRepository,
  getBranch,
  listBranches,
  listOwners,
  listRepositories,
  parseRepoRef,
} from './repos'

const TOKEN = 'ghp_token'
const realFetch = globalThis.fetch

interface Reply {
  body: unknown
  headers?: Record<string, string>
  status?: number
}

let replies: Reply[] = []
let calls: { url: string; method: string; body?: unknown }[] = []

function github(...queued: Reply[]): void {
  replies = queued
  globalThis.fetch = vi.fn((url: URL, init: RequestInit) => {
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      ...(init.body ? { body: JSON.parse(String(init.body)) as unknown } : {}),
    })
    const reply = replies.shift() ?? { body: [] }
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: reply.headers ?? {},
      }),
    )
  }) as unknown as typeof globalThis.fetch
}

function repoPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    name: 'blueprints',
    full_name: 'octocat/blueprints',
    private: false,
    default_branch: 'main',
    description: null,
    size: 120,
    owner: { login: 'octocat' },
    permissions: { push: true },
    ...overrides,
  }
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('listing repositories', () => {
  it("asks for the organisations' repositories too, not only the ones you own", async () => {
    github({ body: [repoPayload()] })
    await listRepositories(TOKEN)
    expect(calls[0]!.url).toContain('affiliation=owner%2Ccollaborator%2Corganization_member')
    expect(calls[0]!.url).toContain('sort=updated')
  })

  it('follows the Link header rather than guessing where the list ends', async () => {
    github(
      {
        body: [repoPayload({ name: 'one', full_name: 'octocat/one' })],
        headers: {
          link: '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=3>; rel="last"',
        },
      },
      { body: [repoPayload({ name: 'two', full_name: 'octocat/two' })] },
    )

    const repos = await listRepositories(TOKEN)

    expect(repos.map((repo) => repo.name)).toEqual(['one', 'two'])
    expect(calls[1]!.url).toBe('https://api.github.com/user/repos?page=2')
  })

  it('reports what the token may do here rather than inferring it from ownership', async () => {
    github({
      body: [
        repoPayload({ permissions: { push: false, pull: true } }),
        repoPayload({
          name: 'admin-only',
          full_name: 'octocat/admin-only',
          permissions: { admin: true },
        }),
        repoPayload({ name: 'unknown', full_name: 'octocat/unknown', permissions: undefined }),
      ],
    })
    const repos = await listRepositories(TOKEN)
    expect(repos.map((repo) => repo.canPush)).toEqual([false, true, false])
  })

  it('marks a repository with no commits, whose default branch does not exist yet', async () => {
    github({ body: [repoPayload({ size: 0, default_branch: 'main' })] })
    const [repo] = await listRepositories(TOKEN)
    expect(repo).toMatchObject({ empty: true, defaultBranch: 'main' })
  })
})

describe('creating a repository', () => {
  it('creates it empty, so the Blueprint is the first commit', async () => {
    github({ body: repoPayload({ size: 0, permissions: undefined }) })
    const repo = await createRepository(TOKEN, { name: 'blueprints', private: true })

    expect(calls[0]).toMatchObject({
      url: 'https://api.github.com/user/repos',
      method: 'POST',
      body: { name: 'blueprints', private: true, auto_init: false },
    })
    // GitHub omits permissions on the create response; the account that made it can write to it.
    expect(repo).toMatchObject({ empty: true, canPush: true })
  })

  it('creates it under an organisation when one was chosen', async () => {
    github({ body: repoPayload({ full_name: 'acme/blueprints', owner: { login: 'acme' } }) })
    await createRepository(TOKEN, { name: 'blueprints', private: false, org: 'acme' })
    expect(calls[0]!.url).toBe('https://api.github.com/orgs/acme/repos')
  })

  it('offers the account and its organisations as owners', async () => {
    github({ body: { login: 'octocat' } }, { body: [{ login: 'acme' }, { login: 'hooli' }] })
    await expect(listOwners(TOKEN)).resolves.toEqual([
      { login: 'octocat', kind: 'user' },
      { login: 'acme', kind: 'organization' },
      { login: 'hooli', kind: 'organization' },
    ])
  })
})

describe('branches', () => {
  it('carries the commit each branch points at, which is what a push needs', async () => {
    github({
      body: [
        { name: 'main', commit: { sha: 'aaa' }, protected: true },
        { name: 'draft', commit: { sha: 'bbb' } },
      ],
    })
    await expect(listBranches(TOKEN, { owner: 'octocat', name: 'blueprints' })).resolves.toEqual([
      { name: 'main', sha: 'aaa', protected: true },
      { name: 'draft', sha: 'bbb', protected: false },
    ])
  })

  it('says a branch is absent rather than failing, because an empty repository has none', async () => {
    github({ body: { message: 'Not Found' }, status: 404 })
    await expect(
      getBranch(TOKEN, { owner: 'octocat', name: 'blueprints' }, 'main'),
    ).resolves.toBeUndefined()
  })

  it('starts a branch at the commit it was branched from', async () => {
    github({ body: { ref: 'refs/heads/blueprint-update', object: { sha: 'aaa' } } })
    await createBranch(TOKEN, { owner: 'octocat', name: 'blueprints' }, 'blueprint-update', 'aaa')
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.github.com/repos/octocat/blueprints/git/refs',
      body: { ref: 'refs/heads/blueprint-update', sha: 'aaa' },
    })
  })
})

describe('reading a repository out of what someone pasted', () => {
  it.each([
    ['octocat/blueprints'],
    ['https://github.com/octocat/blueprints'],
    ['https://github.com/octocat/blueprints.git'],
    ['git@github.com:octocat/blueprints.git'],
    ['  octocat/blueprints  '],
  ])('understands %s', (input) => {
    expect(parseRepoRef(input)).toEqual({ owner: 'octocat', name: 'blueprints' })
  })

  it.each([[''], ['octocat'], ['https://github.com/octocat'], ['octocat/blueprints/tree/main']])(
    'refuses %s rather than guessing',
    (input) => {
      expect(parseRepoRef(input)).toBeUndefined()
    },
  )
})
