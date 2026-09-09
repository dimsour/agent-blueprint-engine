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
import type { AIClient, ChatMessage, TokenUsage } from './client/types'
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
    mode === 'json-schema' ? [...messages] : [...messages, contractMessage(schema)]

  let usage: TokenUsage | undefined
  let raw = ''
  let lastIssues = ''

  for (let attempt = 0; ; attempt += 1) {
    const answer = await client
      .chat(conversation, {
        ...wire,
        ...(mode === 'json-schema'
          ? {
              responseFormat: {
                type: 'json_schema',
                json_schema: { name, schema: toStrictJsonSchema(schema), strict: true },
              },
            }
          : {}),
      })
      .catch((error: unknown) => {
        // The endpoint said it does not do schemas after all. That is a fact about the
        // endpoint, not a failure of this call, so switch paths and try once more.
        if (error instanceof AIError && error.code === 'unsupported' && mode === 'json-schema') {
          return undefined
        }
        throw error
      })

    if (answer === undefined) {
      mode = 'prompt'
      conversation = [...messages, contractMessage(schema)]
      continue
    }

    raw = answer.content
    usage = answer.usage ?? usage

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

/** The instruction that stands in for `response_format` when the endpoint has none. */
function contractMessage(schema: z.ZodType): ChatMessage {
  return {
    role: 'system',
    content: [
      'Answer with a single JSON object and nothing else: no prose, no explanation, no code fence.',
      'It must validate against this JSON Schema:',
      JSON.stringify(toJsonSchema(schema)),
      'Omit optional fields you have nothing to say about rather than inventing a value.',
    ].join('\n'),
  }
}
