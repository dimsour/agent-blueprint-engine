/**
 * Reading a project out of a repository.
 *
 * The rule being checked is which half of the repository is the project: `blueprint/` is the
 * source of truth and everything at the root is output, rebuilt on open. Importing the output
 * too would mean carrying the same truth twice and having to decide which copy wins.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readProjectFromGitHub } from './open'

const TOKEN = 'ghp_token'
const REPO = { owner: 'octocat', name: 'blueprints' }
const realFetch = globalThis.fetch

function repository(files: Record<string, string>, options: { branch?: string } = {}): void {
  const paths = Object.keys(files).sort()
  const shaOf = (path: string) => `sha-${paths.indexOf(path)}`

  globalThis.fetch = vi.fn((url: URL) => {
    const path = String(url)

    if (path.endsWith('/repos/octocat/blueprints')) {
      return Promise.resolve(
        Response.json({
          name: 'blueprints',
          full_name: 'octocat/blueprints',
          private: false,
          default_branch: options.branch ?? 'main',
          description: null,
          owner: { login: 'octocat' },
          permissions: { push: true },
        }),
      )
    }
    if (path.includes('/git/ref/heads/')) {
      const wanted = decodeURIComponent(path.split('/git/ref/heads/')[1] ?? '')
      return Promise.resolve(
        wanted === (options.branch ?? 'main')
          ? Response.json({ object: { sha: 'head' } })
          : Response.json({ message: 'Not Found' }, { status: 404 }),
      )
    }
    if (path.includes('/git/trees/')) {
      return Promise.resolve(
        Response.json({
          sha: 'tree',
          truncated: false,
          tree: paths.map((entry) => ({
            path: entry,
            type: 'blob',
            sha: shaOf(entry),
            size: (files[entry] ?? '').length,
          })),
        }),
      )
    }
    const sha = path.split('/git/blobs/')[1] ?? ''
    const found = paths.find((entry) => shaOf(entry) === sha)
    return Promise.resolve(
      Response.json({ content: btoa(files[found ?? ''] ?? ''), encoding: 'base64' }),
    )
  }) as unknown as typeof globalThis.fetch
}

function fixtureRepository(): Record<string, string> {
  return {
    ...readFixtureFiles('dotnet-testing-expert'),
    'CLAUDE.md': '# Compiled\n',
    '.claude/skills/example/SKILL.md': '# Compiled\n',
    'blueprint/build-manifest.json': '{"schemaVersion":1,"targets":{}}',
  }
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('opening a repository', () => {
  it('reads the source and none of the compiled output', async () => {
    repository(fixtureRepository())

    const { files, branch } = await readProjectFromGitHub(TOKEN, REPO)

    expect(branch).toBe('main')
    expect(files['blueprint/blueprint.yaml']).toContain('dotnet-testing-expert')
    expect(Object.keys(files).every((path) => path.startsWith('blueprint/'))).toBe(true)
    expect(files['CLAUDE.md']).toBeUndefined()
  })

  it('leaves the build manifest behind: it describes that repository, not this copy', async () => {
    repository(fixtureRepository())
    const { files } = await readProjectFromGitHub(TOKEN, REPO)
    expect(files['blueprint/build-manifest.json']).toBeUndefined()
  })

  it('reads the branch it was given, and says so when there is not one', async () => {
    repository(fixtureRepository(), { branch: 'blueprints' })

    await expect(readProjectFromGitHub(TOKEN, REPO, 'blueprints')).resolves.toMatchObject({
      branch: 'blueprints',
    })
    await expect(readProjectFromGitHub(TOKEN, REPO, 'nope')).rejects.toMatchObject({
      code: 'not-found',
      message: expect.stringContaining('no branch called nope'),
    })
  })

  it('says plainly when a repository simply has no Blueprint in it', async () => {
    repository({ 'README.md': '# Just a repository\n', 'src/index.ts': 'export {}\n' })

    await expect(readProjectFromGitHub(TOKEN, REPO)).rejects.toMatchObject({
      code: 'not-found',
      message: expect.stringContaining('blueprint/blueprint.yaml'),
    })
  })
})
