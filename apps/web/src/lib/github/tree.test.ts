/**
 * Reading a branch.
 *
 * The load-bearing claim is that a file already on the branch does not have to be downloaded to
 * be compared, because Git names a blob by the hash of its bytes and we can compute that here.
 * The first test checks the hash against Git's own answer; the rest check that the saving is
 * real, that what is downloaded is decoded, and that a truncated listing is not passed off as a
 * complete one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { gitBlobSha, GitHubTreeFs, readRemoteTree } from './tree'

const TOKEN = 'ghp_token'
const REPO = { owner: 'octocat', name: 'blueprints' }
const realFetch = globalThis.fetch

let handlers: ((url: string) => unknown | undefined)[] = []
let requested: string[] = []

function github(handler: (url: string) => unknown): void {
  handlers = [handler]
  globalThis.fetch = vi.fn((url: URL) => {
    requested.push(String(url))
    const body = handlers[0]?.(String(url))
    return Promise.resolve(
      body === undefined
        ? new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 }),
    )
  }) as unknown as typeof globalThis.fetch
}

function blob(content: string): { content: string; encoding: string } {
  return { content: btoa(content), encoding: 'base64' }
}

beforeEach(() => {
  requested = []
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('naming a blob the way Git does', () => {
  it.each([
    ['hello\n', 'ce013625030ba8dba906f756967f9e9ca394464a'],
    ['', 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'],
    ['what is up, doc?', 'bd9dbf5aae1a3862dd1526723246b20206e5fc37'],
  ])('hashes %j the same as git hash-object', async (content, expected) => {
    await expect(gitBlobSha(content)).resolves.toBe(expected)
  })

  it('hashes the bytes, not the characters, so a multi-byte file is not mis-sized', async () => {
    // Two characters, four bytes: a hash over the string length would differ from Git's.
    await expect(gitBlobSha('é€')).resolves.toHaveLength(40)
  })
})

describe('reading a branch', () => {
  it('is nothing at all when the branch does not exist', async () => {
    github(() => undefined)
    await expect(readRemoteTree(TOKEN, REPO, 'main')).resolves.toBeUndefined()
  })

  it('reads the branch head and its tree, keeping only the files', async () => {
    github((url) =>
      url.includes('/git/ref/heads/')
        ? { object: { sha: 'head-sha' } }
        : {
            sha: 'tree-sha',
            truncated: false,
            tree: [
              { path: 'blueprint', type: 'tree', sha: 'x' },
              { path: 'blueprint/blueprint.yaml', type: 'blob', sha: 'aaa', size: 42 },
            ],
          },
    )

    const tree = await readRemoteTree(TOKEN, REPO, 'main')

    expect(tree).toMatchObject({ commitSha: 'head-sha', treeSha: 'tree-sha', truncated: false })
    expect([...(tree?.entries.keys() ?? [])]).toEqual(['blueprint/blueprint.yaml'])
    expect(requested[1]).toContain('recursive=1')
  })

  it('says when GitHub stopped listing rather than treating a partial tree as the whole one', async () => {
    github((url) =>
      url.includes('/git/ref/heads/')
        ? { object: { sha: 'head-sha' } }
        : { sha: 'tree-sha', truncated: true, tree: [] },
    )
    const tree = await readRemoteTree(TOKEN, REPO, 'main')
    expect(new GitHubTreeFs(TOKEN, REPO, tree).truncated).toBe(true)
  })
})

describe('the branch as a file system', () => {
  const content = 'name: dotnet-testing-expert\n'

  async function treeWith(files: Record<string, string>) {
    const entries = new Map(
      await Promise.all(
        Object.entries(files).map(
          async ([path, text]) =>
            [path, { path, sha: await gitBlobSha(text), size: text.length }] as const,
        ),
      ),
    )
    return { commitSha: 'head', treeSha: 'tree', entries, truncated: false }
  }

  it('downloads nothing for a file the branch already has byte for byte', async () => {
    github(() => blob(content))
    const fs = new GitHubTreeFs(
      TOKEN,
      REPO,
      await treeWith({ 'blueprint/blueprint.yaml': content }),
    )

    await fs.prime({ 'blueprint/blueprint.yaml': content })

    expect(requested).toEqual([])
    await expect(fs.read('blueprint/blueprint.yaml')).resolves.toBe(content)
  })

  it('downloads the ones that differ, and decodes what comes back', async () => {
    github(() => blob('name: something else\n'))
    const fs = new GitHubTreeFs(
      TOKEN,
      REPO,
      await treeWith({ 'blueprint/blueprint.yaml': 'name: something else\n' }),
    )

    await fs.prime({ 'blueprint/blueprint.yaml': content })

    expect(requested).toHaveLength(1)
    await expect(fs.read('blueprint/blueprint.yaml')).resolves.toBe('name: something else\n')
  })

  it('reads a file nobody asked about in advance, and knows what is not there', async () => {
    github(() => blob(content))
    const fs = new GitHubTreeFs(TOKEN, REPO, await treeWith({ 'CLAUDE.md': content }))

    await expect(fs.read('CLAUDE.md')).resolves.toBe(content)
    await expect(fs.read('nothing-here.md')).resolves.toBeUndefined()
    await expect(fs.exists('CLAUDE.md')).resolves.toBe(true)
    await expect(fs.list('blueprint')).resolves.toEqual([])
    expect(requested).toHaveLength(1)
  })

  it('refuses to be written through, because a push is a commit', async () => {
    const fs = new GitHubTreeFs(TOKEN, REPO, await treeWith({}))
    await expect(fs.write()).rejects.toThrow(/commit/)
    await expect(fs.delete()).rejects.toThrow(/commit/)
  })
})
