/**
 * Sign-in, from the side that matters: what leaks.
 *
 * The flow itself is short enough to read. What these tests hold in place is everything around
 * it — that a code arriving without the matching cookie is refused, that the token comes back
 * through `postMessage` to this origin and nowhere else, and that neither the code, the state,
 * the client secret nor the token reaches a log line (docs/08-security.md).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as callback } from './callback/route'
import { GET as start } from './start/route'

const CLIENT_ID = 'Iv1.testclientid'
const CLIENT_SECRET = 'shhh-client-secret'
const CODE = 'authorization-code-abc123'
const TOKEN = 'gho_useraccesstokenvalue'

const realFetch = globalThis.fetch
let exchanges: { url: string; body: string }[] = []

function githubReturns(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn((url: string, init: RequestInit) => {
    exchanges.push({ url: String(url), body: String(init.body) })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as unknown as typeof globalThis.fetch
}

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers })
}

function configured(): void {
  process.env['GITHUB_CLIENT_ID'] = CLIENT_ID
  process.env['GITHUB_CLIENT_SECRET'] = CLIENT_SECRET
}

beforeEach(() => {
  exchanges = []
  delete process.env['GITHUB_CLIENT_ID']
  delete process.env['GITHUB_CLIENT_SECRET']
})

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

describe('starting a sign-in', () => {
  it('is not there at all when the deployment has not configured one', async () => {
    const response = start(request('https://blueprint.test/api/github/oauth/start'))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { message: expect.any(String) } })
  })

  it('sends the browser to GitHub asking only for repository access', () => {
    configured()
    const response = start(request('https://blueprint.test/api/github/oauth/start'))
    const location = new URL(response.headers.get('location') ?? '')

    expect(response.status).toBe(302)
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(location.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(location.searchParams.get('scope')).toBe('repo')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://blueprint.test/api/github/oauth/callback',
    )
    expect(location.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/)
  })

  it('keeps the state where the page cannot read it, and only for these routes', () => {
    configured()
    const response = start(request('https://blueprint.test/api/github/oauth/start'))
    const cookie = response.headers.get('set-cookie') ?? ''
    const state = new URL(response.headers.get('location') ?? '').searchParams.get('state')

    expect(cookie).toContain(`ab_gh_state=${state}`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/api/github/oauth')
    expect(cookie).toContain('Secure')
  })

  it('builds the redirect from the host the browser used, not the one behind the proxy', () => {
    configured()
    const response = start(
      request('http://10.0.0.7:3000/api/github/oauth/start', {
        'x-forwarded-host': 'blueprint.example.com',
        'x-forwarded-proto': 'https',
      }),
    )
    expect(new URL(response.headers.get('location') ?? '').searchParams.get('redirect_uri')).toBe(
      'https://blueprint.example.com/api/github/oauth/callback',
    )
  })
})

describe('completing a sign-in', () => {
  const callbackUrl = (params: string) =>
    `https://blueprint.test/api/github/oauth/callback?${params}`

  it('refuses a code that arrives without the state we set, and exchanges nothing', async () => {
    configured()
    githubReturns({ access_token: TOKEN })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await callback(
      request(callbackUrl(`code=${CODE}&state=somebodyelses`), {
        cookie: 'ab_gh_state=theonewesent',
      }),
    )
    const body = await response.text()

    expect(exchanges).toHaveLength(0)
    expect(response.status).toBe(400)
    expect(body).toContain('did not start here')
    expect(body).not.toContain(CODE)
    expect(logged.mock.calls.flat().join(' ')).not.toContain(CODE)
  })

  it('exchanges the code and hands the token to the opener, targeted at this origin', async () => {
    configured()
    githubReturns({ access_token: TOKEN, token_type: 'bearer' })

    const response = await callback(
      request(callbackUrl(`code=${CODE}&state=matching`), { cookie: 'ab_gh_state=matching' }),
    )
    const body = await response.text()

    expect(exchanges[0]!.url).toBe('https://github.com/login/oauth/access_token')
    expect(JSON.parse(exchanges[0]!.body)).toMatchObject({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: CODE,
    })
    expect(response.status).toBe(200)
    expect(body).toContain(TOKEN)
    expect(body).toContain('"https://blueprint.test"')
    expect(body).toContain('agent-blueprint-github-oauth')
  })

  it('does not keep the token anywhere: no cookie, no URL, no store', async () => {
    configured()
    githubReturns({ access_token: TOKEN })

    const response = await callback(
      request(callbackUrl(`code=${CODE}&state=matching`), { cookie: 'ab_gh_state=matching' }),
    )
    const cookie = response.headers.get('set-cookie') ?? ''

    expect(cookie).not.toContain(TOKEN)
    // The state is spent whatever the outcome, so one authorize is one sign-in.
    expect(cookie).toContain('ab_gh_state=')
    expect(cookie).toContain('Max-Age=0')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
  })

  it('passes on what GitHub said when the exchange fails, and logs neither code nor token', async () => {
    configured()
    githubReturns({ error: 'bad_verification_code', error_description: 'The code has expired.' })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await callback(
      request(callbackUrl(`code=${CODE}&state=matching`), { cookie: 'ab_gh_state=matching' }),
    )
    const body = await response.text()

    expect(response.status).toBe(400)
    expect(body).toContain('The code has expired.')
    const everythingLogged = logged.mock.calls.flat().join(' ')
    expect(everythingLogged).toContain('bad_verification_code')
    expect(everythingLogged).not.toContain(CODE)
    expect(everythingLogged).not.toContain(CLIENT_SECRET)
  })

  it('reports a refusal at GitHub without calling it a failure of ours', async () => {
    configured()
    githubReturns({ access_token: TOKEN })

    const response = await callback(
      request(callbackUrl('error=access_denied&error_description=The+user+said+no.')),
    )

    expect(exchanges).toHaveLength(0)
    expect(await response.text()).toContain('The user said no.')
  })

  it('escapes what it renders, so an error message cannot close the script', async () => {
    configured()
    githubReturns({ error: 'nope', error_description: '</script><script>alert(1)</script>' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const body = await callback(
      request(callbackUrl(`code=${CODE}&state=matching`), { cookie: 'ab_gh_state=matching' }),
    ).then((response) => response.text())

    expect(body).not.toContain('<script>alert(1)</script>')
    expect(body).toContain('&lt;/script&gt;')
  })
})
