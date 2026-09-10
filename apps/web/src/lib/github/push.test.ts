/**
 * The commit.
 *
 * What is being checked is mostly shape: one tree, one commit, one move of the branch, in that
 * order, with the deletions expressed the way Git expects. The two that are not about shape are
 * the ones that matter — a branch that moved while the user was reading the preview must not be
 * overwritten, and a project too large for a single tree must be refused before anything is
 * sent rather than halfway through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pushToGitHub } from './push'

const TOKEN = 'ghp_token'
const REPO = { owner: 'octocat', name: 'blueprints' }
const realFetch = globalThis.fetch

let calls: { method: string; url: string; body: Record<string, unknown> }[] = []
let refStatus = 200

function github(): void {
  globalThis.fetch = vi.fn((url: URL, init: RequestInit) => {
    const path = String(url)
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    calls.push({ method: init.method ?? 'GET', url: path, body })

    if (path.includes('/git/commits/') && (init.method ?? 'GET') === 'GET') {
      return Promise.resolve(Response.json({ tree: { sha: 'base-tree' } }))
    }
    if (path.endsWith('/git/trees')) return Promise.resolve(Response.json({ sha: 'new-tree' }))
    if (path.endsWith('/git/commits')) {
      return Promise.resolve(
        Response.json({ sha: 'new-commit', html_url: 'https://github.test/commit/new-commit' }),
      )
    }
    return Promise.resolve(
      refStatus === 200
        ? Response.json({ ref: 'refs/heads/main' })
        : Response.json({ message: 'Update is not a fast forward' }, { status: refStatus }),
    )
  }) as unknown as typeof globalThis.fetch
}

beforeEach(() => {
  calls = []
  refStatus = 200
  github()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('pushing', () => {
  it('writes one tree, one commit and moves the branch once', async () => {
    const result = await pushToGitHub({
      token: TOKEN,
      repo: REPO,
      branch: 'main',
      message: 'Update the Blueprint',
      parentCommit: 'old-commit',
      writes: { 'blueprint/blueprint.yaml': 'name: x\n', 'CLAUDE.md': '# x\n' },
      deletes: [],
    })

    expect(
      calls.map((call) => `${call.method} ${call.url.replace('https://api.github.com', '')}`),
    ).toEqual([
      'GET /repos/octocat/blueprints/git/commits/old-commit',
      'POST /repos/octocat/blueprints/git/trees',
      'POST /repos/octocat/blueprints/git/commits',
      'PATCH /repos/octocat/blueprints/git/refs/heads/main',
    ])
    expect(calls[1]!.body).toMatchObject({ base_tree: 'base-tree' })
    expect(calls[2]!.body).toMatchObject({
      message: 'Update the Blueprint',
      parents: ['old-commit'],
    })
    expect(calls[3]!.body).toMatchObject({ sha: 'new-commit', force: false })
    expect(result).toMatchObject({ commitSha: 'new-commit', written: 2, deleted: 0 })
  })

  it('names a removed path with a null sha, which is how Git says "gone"', async () => {
    await pushToGitHub({
      token: TOKEN,
      repo: REPO,
      branch: 'main',
      message: 'Remove a skill',
      parentCommit: 'old-commit',
      writes: { 'CLAUDE.md': '# x\n' },
      deletes: ['.claude/skills/gone/SKILL.md'],
    })

    const tree = calls[1]!.body['tree'] as { path: string; sha?: null; content?: string }[]
    expect(tree).toContainEqual({
      path: '.claude/skills/gone/SKILL.md',
      mode: '100644',
      type: 'blob',
      sha: null,
    })
  })

  it('starts a branch that does not exist yet with a commit that has no parent', async () => {
    await pushToGitHub({
      token: TOKEN,
      repo: REPO,
      branch: 'blueprint',
      message: 'Add the Blueprint',
      writes: { 'blueprint/blueprint.yaml': 'name: x\n' },
      // A deletion has no meaning with nothing to delete from, and is dropped rather than sent.
      deletes: ['CLAUDE.md'],
    })

    expect(calls.map((call) => call.method)).toEqual(['POST', 'POST', 'POST'])
    expect(calls[0]!.body['base_tree']).toBeUndefined()
    expect((calls[0]!.body['tree'] as unknown[]).length).toBe(1)
    expect(calls[1]!.body).toMatchObject({ parents: [] })
    expect(calls[2]!.body).toMatchObject({ ref: 'refs/heads/blueprint', sha: 'new-commit' })
  })

  it('refuses to win a race with whoever pushed while the preview was open', async () => {
    refStatus = 422
    await expect(
      pushToGitHub({
        token: TOKEN,
        repo: REPO,
        branch: 'main',
        message: 'Update',
        parentCommit: 'stale-commit',
        writes: { 'CLAUDE.md': '# x\n' },
        deletes: [],
      }),
    ).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('moved') })
  })

  it('says a project is too large before it sends any of it', async () => {
    await expect(
      pushToGitHub({
        token: TOKEN,
        repo: REPO,
        branch: 'main',
        message: 'Update',
        writes: { 'big.md': 'x'.repeat(7_000_001) },
        deletes: [],
      }),
    ).rejects.toMatchObject({ code: 'invalid' })
    expect(calls).toEqual([])
  })
})
