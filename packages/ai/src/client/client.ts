/**
 * The one place this package talks to a model.
 *
 * Bring your own endpoint: anything that answers `POST /chat/completions` in the OpenAI shape
 * works, from api.openai.com to an Ollama on the same laptop. There is no vendor SDK, so the
 * whole surface is `fetch`, which is what lets the same client run in the browser and in a
 * test with a fake.
 *
 * Two rules hold everywhere below. The key is a header and nothing else: it is never put in a
 * URL, never logged, and redacted out of every error (docs/08-security.md). And the client
 * makes no decisions about content — it does not repair, retry on bad output, or interpret a
 * schema. That belongs to `structured()`, so the transport can be tested for what it is.
 */
import { AIError, errorForStatus, retryAfterMs } from './errors'
import { presetFor } from './presets'
import { decodeChunks, sseData } from './sse'
import type {
  AIClient,
  AIClientConfig,
  AIClientDeps,
  ChatDelta,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ProbeResult,
  TokenUsage,
} from './types'

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_PROXY_PATH = '/api/ai/proxy'
const DEFAULT_RETRIES = 1
/** Response bodies are only kept for display, so a paragraph is plenty. */
const MAX_ERROR_BODY = 2_000

/**
 * `${baseUrl}/${path}`, preserving a query string. Azure puts `?api-version=` on the base URL
 * and would otherwise lose it, and Anthropic's documented base URL ends in a slash.
 */
export function endpointUrl(baseUrl: string, path: string): string {
  const [head = '', query] = baseUrl.split('?')
  const trimmed = head.replace(/\/+$/, '')
  return `${trimmed}/${path}${query === undefined ? '' : `?${query}`}`
}

/**
 * Room for the probe to answer. Far more than `{"ok":true}` needs, because a reasoning model
 * spends its budget thinking before it writes anything. Observed against a live reasoning
 * model: roughly forty tokens of reasoning came first, so a budget of twenty returned empty
 * content and `finish_reason: "length"` — which looks exactly like "this endpoint ignores
 * schemas".
 */
const PROBE_MAX_TOKENS = 512

/** The probe asks for this shape; a model that ignores schemas will not produce it. */
const PROBE_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
}

export function createAIClient(config: AIClientConfig, deps: AIClientDeps = {}): AIClient {
  const doFetch = deps.fetch ?? globalThis.fetch
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = deps.now ?? (() => Date.now())
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  function headers(): Record<string, string> {
    const style = config.authHeader ?? presetFor(config.presetId)?.authHeader ?? 'bearer'
    const built: Record<string, string> = {
      'content-type': 'application/json',
      ...config.extraHeaders,
    }
    // Through the proxy the credential travels under its own header name and is put back on
    // the upstream request by the route. It is never sent as this app's own `Authorization`,
    // which is a header a deployment may already use for something else
    // (docs/08-security.md).
    if (config.viaProxy) {
      built['x-ab-upstream-url'] = config.baseUrl
      built['x-ab-upstream-auth-header'] = style === 'api-key' ? 'api-key' : 'authorization'
      if (config.apiKey) {
        built['x-ab-upstream-authorization'] =
          style === 'api-key' ? config.apiKey : `Bearer ${config.apiKey}`
      }
      return built
    }
    if (config.apiKey && style === 'bearer') built.authorization = `Bearer ${config.apiKey}`
    if (config.apiKey && style === 'api-key') built['api-key'] = config.apiKey
    return built
  }

  function urlFor(path: string): string {
    return config.viaProxy
      ? (config.proxyPath ?? DEFAULT_PROXY_PATH)
      : endpointUrl(config.baseUrl, path)
  }

  function body(messages: ChatMessage[], options: ChatOptions, streaming: boolean): string {
    const payload: Record<string, unknown> = { model: config.model, messages, stream: streaming }
    if (options.temperature !== undefined) payload.temperature = options.temperature
    if (options.maxTokens !== undefined) payload.max_tokens = options.maxTokens
    if (options.responseFormat !== undefined) payload.response_format = options.responseFormat
    if (streaming) payload.stream_options = { include_usage: true }
    return JSON.stringify(payload)
  }

  /**
   * One request, with a timeout and a bounded retry for the failures worth retrying. A 400 is
   * never retried: the same body would fail the same way.
   */
  async function send(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    options: { signal?: AbortSignal; retries?: number },
  ): Promise<Response> {
    const retries = options.retries ?? DEFAULT_RETRIES
    let attempt = 0
    for (;;) {
      const controller = new AbortController()
      const timer = setTimeout(() => {
        controller.abort(new AIError('timeout', 'Timed out.'))
      }, timeoutMs)
      const onAbort = () => {
        controller.abort(options.signal?.reason)
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      let response: Response
      try {
        response = await doFetch(url, { ...init, signal: controller.signal })
      } catch (cause) {
        if (options.signal?.aborted) throw new AIError('aborted', 'Cancelled.', { cause })
        const timedOut = controller.signal.aborted
        if (!timedOut && attempt < retries) {
          attempt += 1
          await sleep(backoff(attempt))
          continue
        }
        throw timedOut
          ? new AIError('timeout', `No answer within ${Math.round(timeoutMs / 1000)}s.`, { cause })
          : new AIError(
              'network',
              'Could not reach the endpoint. Check the base URL, and whether the browser is allowed to call it.',
              { cause },
            )
      } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
      }

      if (response.ok) return response

      const text = (await response.text().catch(() => '')).slice(0, MAX_ERROR_BODY)
      const code = errorForStatus(response.status, text)
      const wait = retryAfterMs(response.headers.get('retry-after'), now())
      if ((code === 'rate-limit' || code === 'server') && attempt < retries) {
        attempt += 1
        await sleep(wait ?? backoff(attempt))
        continue
      }
      throw new AIError(code, messageForStatus(code, response.status), {
        status: response.status,
        raw: text,
        ...(wait !== undefined ? { retryAfterMs: wait } : {}),
      })
    }
  }

  async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const response = await send(
      urlFor('chat/completions'),
      { method: 'POST', headers: headers(), body: body(messages, options, false) },
      passThrough(options),
    )
    const json: unknown = await response.json().catch((cause: unknown) => {
      throw new AIError('invalid-output', 'The endpoint did not answer with JSON.', { cause })
    })
    return readCompletion(json, config.model)
  }

  async function* stream(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<ChatDelta> {
    const response = await send(
      urlFor('chat/completions'),
      { method: 'POST', headers: headers(), body: body(messages, options, true) },
      passThrough(options),
    )
    if (!response.body) throw new AIError('network', 'The endpoint sent no stream.')
    // The usage chunk arrives last and carries no content, so it is collected on the way past
    // and handed over with the final delta rather than dropped.
    let usage: TokenUsage | undefined
    for await (const payload of sseData(decodeChunks(response.body))) {
      usage = readUsage(payload) ?? usage
      const delta = readDelta(payload)
      if (delta !== undefined) yield { delta, done: false }
    }
    yield { delta: '', done: true, ...(usage ? { usage } : {}) }
  }

  async function probe(options: { signal?: AbortSignal } = {}): Promise<ProbeResult> {
    const started = now()
    const models = await listModels(options.signal)
    try {
      const result = await chat([{ role: 'user', content: 'Answer with {"ok":true}.' }], {
        maxTokens: PROBE_MAX_TOKENS,
        temperature: 0,
        retries: 0,
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: 'probe', schema: { ...PROBE_SCHEMA }, strict: true },
        },
        ...(options.signal ? { signal: options.signal } : {}),
      })
      // A preset that already knows the endpoint ignores response_format is believed over the
      // answer: the Anthropic route would pass this test and then return prose for real work.
      const declared = presetFor(config.presetId)?.jsonSchema
      return {
        reachable: true,
        authenticated: true,
        model: result.model || config.model,
        jsonSchema: declared === false ? false : probeAnswered(result),
        latencyMs: now() - started,
        models,
      }
    } catch (error) {
      const failure = error instanceof AIError ? error : undefined
      const code = failure?.code ?? 'network'
      return {
        reachable: code !== 'network' && code !== 'timeout',
        authenticated: code !== 'auth',
        model: config.model,
        // `unsupported` means the endpoint rejected the schema, which is an answer about the
        // endpoint rather than a failure to reach it.
        jsonSchema: false,
        latencyMs: now() - started,
        models,
        error: { code, message: failure?.message ?? 'The endpoint could not be reached.' },
      }
    }
  }

  /** Best effort: an endpoint without a `/models` route is not broken. */
  async function listModels(signal: AbortSignal | undefined): Promise<string[]> {
    if (config.viaProxy) return []
    try {
      const response = await send(
        endpointUrl(config.baseUrl, 'models'),
        { method: 'GET', headers: headers() },
        { retries: 0, ...(signal ? { signal } : {}) },
      )
      const json: unknown = await response.json()
      const data = (json as { data?: unknown }).data
      if (!Array.isArray(data)) return []
      return data
        .map((entry) => (entry as { id?: unknown }).id)
        .filter((id): id is string => typeof id === 'string')
        .sort()
    } catch {
      return []
    }
  }

  return { config, chat, stream, probe }
}

function passThrough(options: ChatOptions): { signal?: AbortSignal; retries?: number } {
  return {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.retries !== undefined ? { retries: options.retries } : {}),
  }
}

/** 500 ms, then 1 s — enough to clear a burst limit without making the user wait on a wedge. */
function backoff(attempt: number): number {
  return 500 * 2 ** (attempt - 1)
}

function messageForStatus(code: string, status: number): string {
  switch (code) {
    case 'auth':
      return 'The endpoint rejected the key. Check it in Settings.'
    case 'rate-limit':
      return 'Rate limited by the endpoint.'
    case 'server':
      return `The endpoint failed (HTTP ${status}).`
    case 'unsupported':
      return 'This endpoint does not support JSON-schema responses.'
    case 'context-too-large':
      return 'The request was longer than the model accepts.'
    default:
      return `The endpoint rejected the request (HTTP ${status}).`
  }
}

function readCompletion(json: unknown, fallbackModel: string): ChatResult {
  const choice = (json as { choices?: unknown[] }).choices?.[0]
  const content = (choice as { message?: { content?: unknown } } | undefined)?.message?.content
  if (typeof content !== 'string') {
    throw new AIError('invalid-output', 'The answer had no message content.', {
      raw: JSON.stringify(json).slice(0, MAX_ERROR_BODY),
    })
  }
  const usage = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage
  const finishReason = (choice as { finish_reason?: unknown }).finish_reason
  const model = (json as { model?: unknown }).model
  return {
    content,
    model: typeof model === 'string' ? model : fallbackModel,
    ...(typeof finishReason === 'string' ? { finishReason } : {}),
    ...(usage
      ? {
          usage: {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
          },
        }
      : {}),
  }
}

/** A malformed chunk mid-stream ends nothing; it is skipped. */
function readDelta(payload: string): string | undefined {
  try {
    const json: unknown = JSON.parse(payload)
    const delta = (json as { choices?: { delta?: { content?: unknown } }[] }).choices?.[0]?.delta
      ?.content
    return typeof delta === 'string' && delta !== '' ? delta : undefined
  } catch {
    return undefined
  }
}

/**
 * Did the endpoint honour the schema?
 *
 * The interesting case is the one where we cannot tell. An answer cut off by the token budget
 * says nothing either way, and the two wrong guesses are not equally bad: a wrong `true` costs
 * one rejected request, because `structured()` sees a 400 naming `response_format` and moves to
 * the prompt path by itself. A wrong `false` is stored in settings and quietly takes the weaker
 * path for every call after it, with nothing to notice and nothing to recover from. So when the
 * probe is inconclusive it says yes, and lets the request that follows find out for real.
 */
function probeAnswered(result: ChatResult): boolean {
  const match = /\{[\s\S]*\}/.exec(result.content)
  if (!match) return result.finishReason === 'length'
  try {
    return (JSON.parse(match[0]) as { ok?: unknown }).ok === true
  } catch {
    return false
  }
}

/** The usage chunk an endpoint sends last when `stream_options.include_usage` is honoured. */
function readUsage(payload: string): TokenUsage | undefined {
  try {
    const json: unknown = JSON.parse(payload)
    const usage = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage
    if (!usage) return undefined
    return {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    }
  } catch {
    return undefined
  }
}
