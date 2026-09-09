/**
 * The transport.
 *
 * Every test here runs against a fake `fetch`, because the thing worth checking is the request
 * we send and the meaning we take from the answer — not whether OpenAI is up. The two that
 * matter most are the credential ones: the key must be a header and must never survive into an
 * error, since an error is the one thing that reaches a log or a toast.
 */
import { describe, expect, it } from 'vitest'

import {
  AI_PRESETS,
  AIError,
  createAIClient,
  endpointUrl,
  looksLikeSecret,
  redact,
  sseData,
  type AIClientConfig,
} from '../src/index'

interface Call {
  url: string
  init: RequestInit
}

/** A fetch that answers from a queue and records what it was asked. */
function fakeFetch(responses: (() => Response) | (() => Response)[]) {
  const calls: Call[] = []
  const queue = Array.isArray(responses) ? [...responses] : undefined
  const fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = queue ? queue.shift() : (responses as () => Response)
    if (!next) throw new Error(`No canned response for call ${calls.length}`)
    return Promise.resolve(next())
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}

function completion(content: string, extra: Record<string, unknown> = {}): () => Response {
  return () =>
    new Response(
      JSON.stringify({
        model: 'gpt-test',
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
        ...extra,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
}

function failure(
  status: number,
  body = '{}',
  headers: Record<string, string> = {},
): () => Response {
  return () => new Response(body, { status, headers })
}

function config(overrides: Partial<AIClientConfig> = {}): AIClientConfig {
  return {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test-abcdefghijklmnop',
    model: 'gpt-test',
    features: { jsonSchema: true },
    ...overrides,
  }
}

const slept: number[] = []
const deps = (fetch: typeof globalThis.fetch) => ({
  fetch,
  sleep: (ms: number) => {
    slept.push(ms)
    return Promise.resolve()
  },
  now: () => 1_000,
})

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(call.init.body as string) as Record<string, unknown>
}

function headerOf(call: Call, name: string): string | undefined {
  return (call.init.headers as Record<string, string>)[name]
}

describe('endpointUrl', () => {
  it('builds the route each preset needs', () => {
    // One trailing slash, none, and a query string that has to survive: the three shapes the
    // presets actually take. Azure loses its api-version if the query is appended naively.
    expect(endpointUrl(AI_PRESETS.openai.baseUrl, 'chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
    expect(endpointUrl(AI_PRESETS.anthropic.baseUrl, 'chat/completions')).toBe(
      'https://api.anthropic.com/v1/chat/completions',
    )
    expect(endpointUrl(AI_PRESETS.ollama.baseUrl, 'models')).toBe(
      'http://localhost:11434/v1/models',
    )
    expect(
      endpointUrl(
        'https://acme.openai.azure.com/openai/deployments/gpt4?api-version=2024-10-21',
        'chat/completions',
      ),
    ).toBe(
      'https://acme.openai.azure.com/openai/deployments/gpt4/chat/completions?api-version=2024-10-21',
    )
  })
})

describe('createAIClient', () => {
  it('sends the key as a header, in the style the preset wants', async () => {
    const bearer = fakeFetch(completion('hi'))
    await createAIClient(config({ presetId: 'openai' }), deps(bearer.fetch)).chat([
      { role: 'user', content: 'hello' },
    ])
    expect(headerOf(bearer.calls[0]!, 'authorization')).toBe('Bearer sk-test-abcdefghijklmnop')
    expect(headerOf(bearer.calls[0]!, 'api-key')).toBeUndefined()
    expect(bearer.calls[0]!.url).not.toContain('sk-test')

    const azure = fakeFetch(completion('hi'))
    await createAIClient(config({ presetId: 'azure-openai' }), deps(azure.fetch)).chat([
      { role: 'user', content: 'hello' },
    ])
    expect(headerOf(azure.calls[0]!, 'api-key')).toBe('sk-test-abcdefghijklmnop')
    expect(headerOf(azure.calls[0]!, 'authorization')).toBeUndefined()

    const local = fakeFetch(completion('hi'))
    await createAIClient(
      {
        presetId: 'ollama',
        baseUrl: AI_PRESETS.ollama.baseUrl,
        model: 'llama3',
        features: {},
      },
      deps(local.fetch),
    ).chat([{ role: 'user', content: 'hello' }])
    expect(headerOf(local.calls[0]!, 'authorization')).toBeUndefined()
  })

  it('sends the options the protocol names, and nothing else', async () => {
    const { fetch, calls } = fakeFetch(completion('{"ok":true}'))
    await createAIClient(config(), deps(fetch)).chat([{ role: 'user', content: 'q' }], {
      temperature: 0.2,
      maxTokens: 500,
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'out', schema: { type: 'object' }, strict: true },
      },
    })
    expect(bodyOf(calls[0]!)).toEqual({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'q' }],
      stream: false,
      temperature: 0.2,
      max_tokens: 500,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'out', schema: { type: 'object' }, strict: true },
      },
    })
  })

  it('reads the content, model and usage back out', async () => {
    const { fetch } = fakeFetch(completion('the answer'))
    const result = await createAIClient(config(), deps(fetch)).chat([
      { role: 'user', content: 'q' },
    ])
    expect(result).toEqual({
      content: 'the answer',
      model: 'gpt-test',
      finishReason: 'stop',
      usage: { promptTokens: 11, completionTokens: 7 },
    })
  })

  it('routes through the proxy without putting the base URL in the path', async () => {
    const { fetch, calls } = fakeFetch(completion('hi'))
    await createAIClient(
      config({ viaProxy: true, baseUrl: 'http://localhost:11434/v1' }),
      deps(fetch),
    ).chat([{ role: 'user', content: 'q' }])
    expect(calls[0]!.url).toBe('/api/ai/proxy')
    expect(headerOf(calls[0]!, 'x-blueprint-base-url')).toBe('http://localhost:11434/v1')
  })

  it('names each failure by what the user has to do about it', async () => {
    const cases: [number, string, string][] = [
      [401, '{}', 'auth'],
      [403, '{}', 'auth'],
      [400, 'response_format is not supported', 'unsupported'],
      [400, 'maximum context length exceeded', 'context-too-large'],
      [400, 'model is required', 'bad-request'],
    ]
    for (const [status, body, code] of cases) {
      const { fetch } = fakeFetch(failure(status, body))
      const client = createAIClient(config(), deps(fetch))
      const error = await client.chat([{ role: 'user', content: 'q' }]).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(AIError)
      expect((error as AIError).code, `${status} ${body}`).toBe(code)
      expect((error as AIError).status).toBe(status)
    }
  })

  it('retries a rate limit once, waiting as long as it was told to', async () => {
    slept.length = 0
    const { fetch, calls } = fakeFetch([
      failure(429, 'slow down', { 'retry-after': '3' }),
      completion('second time'),
    ])
    const result = await createAIClient(config(), deps(fetch)).chat([
      { role: 'user', content: 'q' },
    ])
    expect(result.content).toBe('second time')
    expect(calls).toHaveLength(2)
    expect(slept).toEqual([3000])
  })

  it('gives up after the retry budget and surfaces the last failure', async () => {
    slept.length = 0
    const { fetch, calls } = fakeFetch([failure(503, 'down'), failure(503, 'down')])
    const error = await createAIClient(config(), deps(fetch))
      .chat([{ role: 'user', content: 'q' }])
      .catch((e: unknown) => e)
    expect(calls).toHaveLength(2)
    expect((error as AIError).code).toBe('server')
  })

  it('does not retry a request the endpoint will reject the same way twice', async () => {
    const { fetch, calls } = fakeFetch([failure(400, 'model is required')])
    await createAIClient(config(), deps(fetch))
      .chat([{ role: 'user', content: 'q' }])
      .catch(() => undefined)
    expect(calls).toHaveLength(1)
  })

  it('reports a failure to connect as something the proxy might fix', async () => {
    const fetch = (() =>
      Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof globalThis.fetch
    const error = await createAIClient(config(), deps(fetch))
      .chat([{ role: 'user', content: 'q' }], { retries: 0 })
      .catch((e: unknown) => e)
    expect((error as AIError).code).toBe('network')
  })

  it('never lets a key reach an error', async () => {
    // The endpoint echoing the Authorization header back in its error body is the case that
    // would otherwise put the key in a toast.
    const { fetch } = fakeFetch(
      failure(400, 'rejected request with header Authorization: Bearer sk-test-abcdefghijklmnop'),
    )
    const error = (await createAIClient(config(), deps(fetch))
      .chat([{ role: 'user', content: 'q' }])
      .catch((e: unknown) => e)) as AIError
    expect(error.raw).not.toContain('sk-test-abcdefghijklmnop')
    expect(error.raw).toContain('[redacted]')
  })
})

describe('stream', () => {
  it('reassembles deltas that arrive split across chunks', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel'))
        controller.enqueue(
          encoder.encode('lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n'),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    const { fetch, calls } = fakeFetch(() => new Response(body, { status: 200 }))
    const parts: string[] = []
    let finished = false
    for await (const chunk of createAIClient(config(), deps(fetch)).stream([
      { role: 'user', content: 'q' },
    ])) {
      if (chunk.done) finished = true
      else parts.push(chunk.delta)
    }
    expect(parts.join('')).toBe('Hello world')
    expect(finished).toBe(true)
    expect(bodyOf(calls[0]!).stream).toBe(true)
  })

  it('stops at [DONE] and skips a chunk it cannot read', async () => {
    function* chunks() {
      yield 'data: {"choices":[{"delta":{"content":"a"}}]}\n'
      yield 'data: not json\n'
      yield 'data: [DONE]\n'
      yield 'data: {"choices":[{"delta":{"content":"never"}}]}\n'
    }
    const payloads: string[] = []
    for await (const payload of sseData(chunks())) payloads.push(payload)
    expect(payloads).toEqual(['{"choices":[{"delta":{"content":"a"}}]}', 'not json'])
  })
})

describe('probe', () => {
  it('reports a reachable endpoint that honours the schema', async () => {
    const { fetch, calls } = fakeFetch([
      () =>
        new Response(JSON.stringify({ data: [{ id: 'gpt-b' }, { id: 'gpt-a' }] }), { status: 200 }),
      completion('{"ok":true}'),
    ])
    const result = await createAIClient(config({ presetId: 'openai' }), deps(fetch)).probe()
    expect(result).toMatchObject({
      reachable: true,
      authenticated: true,
      jsonSchema: true,
      models: ['gpt-a', 'gpt-b'],
    })
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/models')
    expect(bodyOf(calls[1]!).max_tokens).toBe(20)
  })

  it('does not claim schema support because prose came back', async () => {
    const { fetch } = fakeFetch([failure(404, 'no such route'), completion('Sure! ok is true.')])
    const result = await createAIClient(config({ presetId: 'custom' }), deps(fetch)).probe()
    expect(result.reachable).toBe(true)
    expect(result.jsonSchema).toBe(false)
    expect(result.models).toEqual([])
  })

  it('believes the Anthropic preset over the answer', async () => {
    // That route accepts response_format and ignores it, so a schema-shaped reply here would
    // be luck. Trusting it would mean structured operations fail on real work instead.
    const { fetch } = fakeFetch([failure(404, 'no route'), completion('{"ok":true}')])
    const result = await createAIClient(
      config({ presetId: 'anthropic', baseUrl: AI_PRESETS.anthropic.baseUrl }),
      deps(fetch),
    ).probe()
    expect(result.reachable).toBe(true)
    expect(result.jsonSchema).toBe(false)
  })

  it('separates a bad key from an unreachable endpoint', async () => {
    const rejected = fakeFetch([failure(401, 'bad key'), failure(401, 'bad key')])
    const auth = await createAIClient(config(), deps(rejected.fetch)).probe()
    expect(auth).toMatchObject({ reachable: true, authenticated: false })
    expect(auth.error?.code).toBe('auth')

    const offline = (() =>
      Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof globalThis.fetch
    const down = await createAIClient(config(), deps(offline)).probe()
    expect(down).toMatchObject({ reachable: false, authenticated: true })
    expect(down.error?.code).toBe('network')
  })
})

describe('redact', () => {
  it('hides the shapes a credential takes', () => {
    expect(redact('Authorization: Bearer sk-proj-abcdefghijklmnop')).toBe(
      'Authorization: [redacted]',
    )
    expect(redact('{"api-key":"9f8e7d6c5b4a3210ffff"}')).toBe('{"api-key":"[redacted]"}')
    expect(redact('token ghp_0123456789abcdefghij')).toBe('token [redacted]')
    expect(redact('nothing to hide')).toBe('nothing to hide')
    expect(looksLikeSecret('here is sk-ant-api03-abcdefghijklmnop')).toBe(true)
    expect(looksLikeSecret('a normal sentence')).toBe(false)
  })
})
