/**
 * The transport, and the one thing it must never do.
 *
 * Most of these check that a status becomes a code a caller can act on — "wait" and "get a
 * better token" are different repairs and the difference is not in the status alone. The last
 * one checks that no error carries the token, which is the reason this file exists rather than
 * a dependency.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GitHubError, githubRequest, viewer } from './client'

const TOKEN = 'ghp_secretsecretsecretsecret'
const realFetch = globalThis.fetch

function answers(status: number, body: unknown, headers: Record<string, string> = {}): void {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(body === undefined ? '' : JSON.stringify(body), { status, headers }),
    ),
  ) as unknown as typeof globalThis.fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('the GitHub transport', () => {
  it('sends the token as a bearer credential and asks for a pinned API version', async () => {
    answers(200, { login: 'octocat', name: null, avatar_url: null })
    await githubRequest(TOKEN, { path: '/user' })

    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      URL,
      RequestInit,
    ]
    const headers = init.headers as Headers
    expect(String(url)).toBe('https://api.github.com/user')
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(headers.get('x-github-api-version')).toBe('2022-11-28')
  })

  it('puts query parameters on the URL and leaves absent ones off it', async () => {
    answers(200, [])
    await githubRequest(TOKEN, {
      path: '/user/repos',
      query: { per_page: 100, page: 1, affiliation: undefined },
    })
    const [url] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [URL]
    expect(String(url)).toBe('https://api.github.com/user/repos?per_page=100&page=1')
  })

  it('reads the scopes a classic token carries out of the header', async () => {
    answers(
      200,
      { login: 'octocat', name: 'Mona', avatar_url: 'https://example.test/a.png' },
      { 'x-oauth-scopes': 'repo, read:org' },
    )
    await expect(viewer(TOKEN)).resolves.toEqual({
      login: 'octocat',
      name: 'Mona',
      avatarUrl: 'https://example.test/a.png',
      scopes: ['repo', 'read:org'],
    })
  })

  it('reports no scopes rather than an empty-string scope for a fine-grained token', async () => {
    answers(200, { login: 'octocat', name: null, avatar_url: null }, { 'x-oauth-scopes': '' })
    await expect(viewer(TOKEN)).resolves.toMatchObject({ scopes: [] })
  })

  it('tells a rejected token apart from an exhausted one', async () => {
    answers(401, { message: 'Bad credentials' })
    await expect(githubRequest(TOKEN, { path: '/user' })).rejects.toMatchObject({
      code: 'unauthorized',
    })

    answers(
      403,
      { message: 'API rate limit exceeded' },
      {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120),
      },
    )
    const limited = await githubRequest(TOKEN, { path: '/user' }).catch((error: unknown) => error)
    expect(limited).toBeInstanceOf(GitHubError)
    expect((limited as GitHubError).code).toBe('rate-limited')
    expect((limited as GitHubError).message).toContain('minutes')

    answers(
      403,
      { message: 'Resource not accessible by personal access token' },
      {
        'x-ratelimit-remaining': '4980',
      },
    )
    await expect(githubRequest(TOKEN, { path: '/user' })).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Resource not accessible by personal access token',
    })
  })

  it('unpacks the detail of a rejected write, where the useful sentence lives', async () => {
    answers(422, {
      message: 'Validation Failed',
      errors: [{ message: 'Reference already exists' }],
    })
    await expect(githubRequest(TOKEN, { path: '/repos/o/r/git/refs' })).rejects.toMatchObject({
      code: 'invalid',
      message: 'Validation Failed: Reference already exists',
    })
  })

  it('returns nothing for a 404 the caller expects, and throws for one it does not', async () => {
    answers(404, { message: 'Not Found' })
    await expect(
      githubRequest(TOKEN, { path: '/repos/o/r/contents/blueprint', allowMissing: true }),
    ).resolves.toMatchObject({ data: undefined })

    answers(404, { message: 'Not Found' })
    await expect(githubRequest(TOKEN, { path: '/repos/o/r' })).rejects.toMatchObject({
      code: 'not-found',
    })
  })

  it('turns an unreachable network into an error rather than a rejection nobody typed', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    ) as unknown as typeof globalThis.fetch
    await expect(githubRequest(TOKEN, { path: '/user' })).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('never puts the token in an error, however deep you look', async () => {
    for (const status of [401, 403, 404, 409, 422, 500]) {
      answers(status, { message: `something about ${TOKEN}`.replace(TOKEN, 'a repository') })
      const error = await githubRequest(TOKEN, { path: '/user' }).catch((thrown: unknown) => thrown)
      const everything = `${String(error)} ${(error as Error).stack ?? ''} ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
      expect(everything).not.toContain(TOKEN)
    }
  })
})
