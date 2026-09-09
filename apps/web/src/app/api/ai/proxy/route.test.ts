/**
 * The relay.
 *
 * Two of these tests are the reason the route is allowed to exist at all: it must not relay to
 * a host the deployment did not name, and it must not hold on to the key it forwards. The rest
 * check that what comes back is the endpoint's answer rather than this route's opinion of it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { POST } from './route'

const realFetch = globalThis.fetch
let upstream: { url: string; headers: Record<string, string>; body: string }[] = []

function upstreamAnswers(status = 200, body = '{"choices":[]}') {
  globalThis.fetch = ((url: URL, init: RequestInit) => {
    const headers: Record<string, string> = {}
    ;(init.headers as Headers).forEach((value, name) => {
      headers[name] = value
    })
    upstream.push({ url: String(url), headers, body: String(init.body) })
    return Promise.resolve(new Response(body, { status }))
  }) as unknown as typeof globalThis.fetch
}

function relayRequest(headers: Record<string, string>): Request {
  return new Request('https://blueprint.test/api/ai/proxy', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: 'llama3', messages: [] }),
  })
}

beforeEach(() => {
  upstream = []
  delete process.env['AI_PROXY_ALLOWED_HOSTS']
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('the AI proxy', () => {
  it('relays to a local endpoint and streams the answer back unchanged', async () => {
    upstreamAnswers(200, '{"choices":[{"message":{"content":"hi"}}]}')
    const response = await POST(
      relayRequest({
        'content-type': 'application/json',
        'x-ab-upstream-url': 'http://localhost:11434/v1',
        'x-ab-upstream-authorization': 'Bearer sk-local-abcdefghijklmnop',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('hi')
    expect(upstream[0]!.url).toBe('http://localhost:11434/v1/chat/completions')
    expect(upstream[0]!.body).toContain('llama3')
  })

  it('puts the credential back on the upstream request, under the name the endpoint wants', async () => {
    upstreamAnswers()
    await POST(
      relayRequest({
        'x-ab-upstream-url': 'http://127.0.0.1:1234/v1',
        'x-ab-upstream-authorization': 'Bearer sk-local-abcdefghijklmnop',
      }),
    )
    expect(upstream[0]!.headers['authorization']).toBe('Bearer sk-local-abcdefghijklmnop')
    // It arrived under x-ab-*, and nothing of that shape is passed on.
    expect(Object.keys(upstream[0]!.headers).some((name) => name.startsWith('x-ab-'))).toBe(false)

    upstream = []
    await POST(
      relayRequest({
        'x-ab-upstream-url': 'http://127.0.0.1:1234/v1',
        'x-ab-upstream-authorization': 'a-key',
        'x-ab-upstream-auth-header': 'api-key',
      }),
    )
    expect(upstream[0]!.headers['api-key']).toBe('a-key')
    expect(upstream[0]!.headers['authorization']).toBeUndefined()
  })

  it('will not be used as an open relay', async () => {
    upstreamAnswers()
    const response = await POST(relayRequest({ 'x-ab-upstream-url': 'https://api.openai.com/v1' }))

    expect(response.status).toBe(403)
    expect(upstream).toEqual([])
    // The refusal names the host asked for, not the list of hosts that would work.
    const body = (await response.json()) as { error: { message: string } }
    expect(body.error.message).toContain('api.openai.com')
    expect(body.error.message).not.toContain('localhost')
  })

  it('relays where the deployment says it may', async () => {
    process.env['AI_PROXY_ALLOWED_HOSTS'] = 'gpu.internal, localhost'
    upstreamAnswers()
    const response = await POST(
      relayRequest({ 'x-ab-upstream-url': 'http://gpu.internal:8000/v1' }),
    )
    expect(response.status).toBe(200)
    expect(upstream[0]!.url).toBe('http://gpu.internal:8000/v1/chat/completions')
  })

  it('refuses anything that is not an http endpoint', async () => {
    upstreamAnswers()
    for (const url of ['file:///etc/passwd', 'not a url', '']) {
      const response = await POST(relayRequest({ 'x-ab-upstream-url': url }))
      expect(response.status, url).toBe(400)
    }
    expect(upstream).toEqual([])
  })

  it('never turns an upstream refusal into its own', async () => {
    // The client decides what a 401 means; the route must not swallow or relabel it.
    upstreamAnswers(401, '{"error":{"message":"bad key"}}')
    const response = await POST(relayRequest({ 'x-ab-upstream-url': 'http://localhost:11434/v1' }))
    expect(response.status).toBe(401)
    expect(await response.text()).toContain('bad key')
  })

  it('says the endpoint could not be reached rather than failing silently', async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError('connect ECONNREFUSED'))) as unknown as typeof globalThis.fetch
    const response = await POST(relayRequest({ 'x-ab-upstream-url': 'http://localhost:11434/v1' }))
    expect(response.status).toBe(502)
    expect((await response.json()) as { error: { message: string } }).toMatchObject({
      error: { message: 'Could not reach localhost.' },
    })
  })
})
