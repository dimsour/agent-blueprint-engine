/**
 * Asking for an object rather than a paragraph.
 *
 * Everything this package does with a model is really one question: "give me this shape".
 * Whether the endpoint can promise the shape is not something the caller should have to know,
 * so `structured()` takes both paths and returns the same result either way:
 *
 *   A. `response_format: json_schema` when the endpoint supports it. The answer is JSON.
 *   B. the schema in the prompt otherwise. The answer is JSON somewhere inside prose.
 *
 * Either path ends at the same Zod `parse`, which is the actual guarantee. A model that
 * answers with the wrong shape gets one chance to fix it, told exactly which fields were
 * wrong; after that the call fails with the raw text attached so the UI can show what it got.
 * Nothing that fails validation is ever returned, so an operation downstream cannot receive a
 * malformed entity (AGENTS.md rule 6).
 */
import type * as z from 'zod'

import { AIError, looksLikeSecret } from './client/errors'
import { presetFor } from './client/presets'
import type {
  AIClient,
  ChatMessage,
  ChatOptions,
  ChatResult,
  JsonSchemaResponseFormat,
  TokenUsage,
} from './client/types'
import { dropNulls, extractJson, issueLines, toJsonSchema, toStrictJsonSchema } from './json-schema'

export interface StructuredOptions {
  /** Low by default: these are extraction tasks, not creative ones. */
  temperature?: number
  maxTokens?: number
  /** Repair round trips after a validation failure. Default 1. */
  repairs?: number
  /** Name given to the schema on the wire. Default `result`. */
  name?: string
  signal?: AbortSignal
  /**
   * Called as the answer arrives, with the characters received so far, so a caller can show
   * that something is happening. Only the streaming path reports; a non-streaming answer
   * arrives all at once and there is nothing honest to report before it does.
   */
  onProgress?: (received: number) => void
  /**
   * Off to force the single-response path. On by default, because it is what makes a slow
   * model visibly slow rather than indistinguishable from a broken one — and what turns the
   * timeout into "nothing arrived for a while" instead of "took longer than N seconds".
   */
  stream?: boolean
}

export interface StructuredResult<T> {
  value: T
  raw: string
  repaired: boolean
  /** Which path produced it. Worth surfacing: path B is the one that can cost extra calls. */
  mode: 'json-schema' | 'prompt'
  usage?: TokenUsage
}

const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_REPAIRS = 1
/** The client's own timeout, when it has not been told one. Kept in step with the client. */
const DEFAULT_TIMEOUT_MS = 120_000
/** Enough of a stalled answer to see where it stopped, without pasting an essay into an error. */
const MAX_PARTIAL = 2_000

/**
 * One answer, streamed when the endpoint allows it.
 *
 * Streaming is not a nicety here. A completion that is not streamed sends nothing at all until
 * the model has finished, so the client's timeout — which measures time to the first byte — is
 * really a cap on how long the model may take to think. On a local 30B that is a guaranteed
 * failure at two minutes, no matter how healthy the connection is, and the only signal the
 * caller can offer meanwhile is a spinner. Streamed, the first token arrives in seconds: the
 * timeout below becomes "nothing has arrived for a while", which is the thing actually worth
 * failing on, and the caller gets something true to show.
 *
 * There is deliberately no fallback to a single request when a stream fails. Every
 * OpenAI-compatible endpoint this package targets streams, and "retry the other way when the
 * first way failed" cannot tell an endpoint that will not stream from a schema it rejected, a
 * key it refused or a rate limit — it would swallow all three and charge for a second request.
 * `stream: false` is the switch for an endpoint that cannot, and Settings exposes it.
 */
async function answer(
  client: AIClient,
  messages: ChatMessage[],
  options: ChatOptions,
  streaming: boolean,
  onProgress: ((received: number) => void) | undefined,
): Promise<ChatResult> {
  // Nobody is waiting for this answer, so it is not worth asking for — and on a metered
  // endpoint an answer nobody reads is still an answer somebody pays for.
  if (options.signal?.aborted) throw new AIError('aborted', 'Cancelled.')
  if (!streaming) return client.chat(messages, options)

  const idleMs = client.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const watchdog = new AbortController()
  const onAbort = () => watchdog.abort(options.signal?.reason)
  // Checked as well as listened for: `addEventListener('abort')` on a signal that has already
  // aborted never fires, and a caller who stopped before the call began still means it.
  if (options.signal?.aborted) watchdog.abort(options.signal.reason)
  else options.signal?.addEventListener('abort', onAbort, { once: true })

  let received = ''
  let usage: TokenUsage | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const wait = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => watchdog.abort(), idleMs)
  }

  /*
   * The loop watches the clock itself rather than trusting the signal to interrupt it.
   *
   * Aborting the request that produced the stream does not necessarily end a read already
   * waiting on the body, and a stalled endpoint is precisely the case where nothing else will
   * ever wake it: the whole point of a stall watchdog is that no further bytes are coming, so
   * `await next()` would wait for ever. Racing each read against the abort is what makes the
   * timeout real instead of advisory.
   */
  const iterator = client
    .stream(messages, { ...options, signal: watchdog.signal })
    [Symbol.asyncIterator]()
  const stopped = new Promise<never>((_, reject) => {
    // Already aborted counts, for the same reason as above: the listener would never fire.
    if (watchdog.signal.aborted) reject(new StreamStopped())
    else
      watchdog.signal.addEventListener('abort', () => reject(new StreamStopped()), { once: true })
  })

  try {
    wait()
    for (;;) {
      const step = await Promise.race([iterator.next(), stopped])
      if (step.done === true) break
      wait()
      received += step.value.delta
      usage = step.value.usage ?? usage
      if (step.value.delta !== '') onProgress?.(received.length)
    }
    return { content: received, model: client.config.model, ...(usage ? { usage } : {}) }
  } catch (cause) {
    // Stopping is the caller's decision and never a failure of the endpoint.
    if (options.signal?.aborted) {
      throw cause instanceof AIError && cause.code === 'aborted'
        ? cause
        : new AIError('aborted', 'Cancelled.', { cause })
    }
    if (!watchdog.signal.aborted) throw cause
    throw new AIError(
      'timeout',
      received === ''
        ? `Nothing arrived within ${Math.round(idleMs / 1000)}s.`
        : `The answer stopped arriving, with nothing further for ${Math.round(idleMs / 1000)}s.`,
      { cause, raw: received.slice(0, MAX_PARTIAL) },
    )
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
    // Releases the body when the loop left early; a generator that is never returned to keeps
    // the connection open.
    void iterator.return?.(undefined).catch(() => undefined)
  }
}

/** Internal: what the race rejects with, so the catch above can tell it from a real error. */
class StreamStopped extends Error {
  constructor() {
    super('The stream was stopped.')
    this.name = 'StreamStopped'
  }
}

export async function structured<T>(
  client: AIClient,
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  options: StructuredOptions = {},
): Promise<StructuredResult<T>> {
  const repairs = options.repairs ?? DEFAULT_REPAIRS
  const name = options.name ?? 'result'
  const wire = {
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  }

  let mode: 'json-schema' | 'prompt' = client.config.features.jsonSchema ? 'json-schema' : 'prompt'
  let conversation: ChatMessage[] =
    mode === 'json-schema' ? [...messages] : withContract(messages, schema)

  let usage: TokenUsage | undefined
  let raw = ''
  let lastIssues = ''
  /**
   * Counts repairs only. Dropping the schema is not one: it is the endpoint telling us how to
   * ask, not the model getting the answer wrong, and charging it against the repair budget left
   * nothing for the model that most needs it — an endpoint with no schema enforcement is
   * exactly the one whose first answer is likeliest to miss the shape.
   */
  let attempt = 0

  for (;;) {
    const reply = await answer(
      client,
      conversation,
      {
        ...wire,
        ...(mode === 'json-schema'
          ? { responseFormat: responseFormatFor(client, name, schema) }
          : {}),
      },
      options.stream ?? true,
      options.onProgress,
    ).catch((error: unknown) => {
      // We sent a schema and the endpoint rejected the request. Whether it said so in words
      // we recognise (`unsupported`) or not at all is the endpoint's business — one hosted
      // API rejects schemas carrying `pattern` or `minLength` with nothing but "Request
      // contains an invalid argument". Either way the cheapest next move is the same: ask again
      // without the schema. It costs one request, it cannot loop because the retry is on the
      // prompt path, and a 400 for some other reason still surfaces from there.
      const rejected =
        error instanceof AIError && (error.code === 'unsupported' || error.code === 'bad-request')
      if (rejected && mode === 'json-schema') return undefined
      throw error
    })

    if (reply === undefined) {
      mode = 'prompt'
      conversation = withContract(messages, schema)
      continue
    }

    raw = reply.content
    usage = reply.usage ?? usage

    const parsed = validate(schema, raw)
    if (parsed.ok) {
      return {
        value: parsed.value,
        raw,
        repaired: attempt > 0,
        mode,
        ...(usage ? { usage } : {}),
      }
    }
    if (parsed.fatal || attempt >= repairs) {
      throw new AIError('invalid-output', parsed.message, { raw })
    }
    lastIssues = parsed.message
    attempt += 1
    conversation = [
      ...conversation,
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content: `That did not match the required shape:\n${lastIssues}\n\nAnswer again with a single corrected JSON object and no other text.`,
      },
    ]
  }
}

/**
 * Which dialect of JSON Schema to send.
 *
 * OpenAI's strict mode is the only one that demands every property be required, with an
 * optional field expressed as "or null". That is a real guarantee and worth having where it is
 * offered — but it is also the only place it is *required*, and everywhere else it is pure
 * cost: the model has to write out every optional field of every artifact, mostly as `null`.
 *
 * On a large schema that is the difference between working and not. Measured against a live
 * local model drafting a whole Blueprint: about 2 600 tokens and finished with the plain
 * schema, still going at 6 000 with the strict one, which is why several of the models checked
 * could not complete that operation at all. Endpoints backed by grammar-constrained decoding
 * handle optional properties natively and need none of it.
 *
 * Correctness does not rest on this either way: both paths end at the same Zod parse, with a
 * repair round trip behind it.
 */
function responseFormatFor(
  client: AIClient,
  name: string,
  schema: z.ZodType,
): JsonSchemaResponseFormat {
  const strict =
    client.config.strictSchema ?? presetFor(client.config.presetId)?.strictSchema ?? false
  return strict
    ? {
        type: 'json_schema',
        json_schema: { name, schema: toStrictJsonSchema(schema), strict: true },
      }
    : { type: 'json_schema', json_schema: { name, schema: toJsonSchema(schema) } }
}

type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; /** No repair can help; fail now. */ fatal: boolean }

function validate<T>(schema: z.ZodType<T>, raw: string): Validation<T> {
  // A model that echoes a credential back at us must not get as far as a ChangeSet, and
  // asking it again would only produce the same text (docs/06-ai-layer.md, security rules).
  if (looksLikeSecret(raw)) {
    return {
      ok: false,
      message: 'The answer contained something shaped like a credential.',
      fatal: true,
    }
  }

  const json = extractJson(raw)
  if (json === undefined)
    return { ok: false, message: 'The answer contained no JSON object.', fatal: false }

  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (error) {
    return {
      ok: false,
      message: `The JSON did not parse: ${(error as Error).message}`,
      fatal: false,
    }
  }

  const result = schema.safeParse(dropNulls(value))
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, message: issueLines(result.error), fatal: false }
}

/**
 * The instruction that stands in for `response_format` when the endpoint has none.
 *
 * It goes on the end of the last user message rather than into a message of its own, and that
 * is not a style choice. A second `system` message after the user's turn is rejected outright
 * by any model whose chat template requires the system message to come first — one such model
 * answered `Jinja Exception: System message must be at the beginning.`, and the whole fallback
 * path was unusable on it. Two consecutive `user` messages break strict-alternation templates the same
 * way. Appending keeps one system message at the front and one user turn at the back, which
 * every template accepts, and it keeps the contract next to the answer, where instructions are
 * followed best.
 */
function withContract(messages: ChatMessage[], schema: z.ZodType): ChatMessage[] {
  const contract = [
    'Answer with a single JSON object and nothing else: no prose, no explanation, no code fence.',
    'It must validate against this JSON Schema:',
    JSON.stringify(toJsonSchema(schema)),
    'Omit optional fields you have nothing to say about rather than inventing a value.',
  ].join('\n')

  const last = messages.at(-1)
  if (last?.role === 'user') {
    return [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n${contract}` }]
  }
  return [...messages, { role: 'user', content: contract }]
}
