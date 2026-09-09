/**
 * Getting an object out of a model.
 *
 * The interesting cases are all failure cases: the endpoint that says it does schemas and
 * does not, the model that wraps its JSON in an apology, the one that gets a field wrong, and
 * the one that echoes a key back. Each is a real thing endpoints do, and each has to end
 * either in a validated value or in an error — never in a half-parsed object reaching a
 * ChangeSet.
 */
import { describe, expect, it } from 'vitest'
import * as z from 'zod'

import {
  AIError,
  createAIClient,
  dropNulls,
  estimateTokens,
  extractJson,
  structured,
  toJsonSchema,
  toStrictJsonSchema,
  truncateToTokens,
  type AIClientConfig,
} from '../src/index'

const skill = z.object({
  id: z.string(),
  name: z.string(),
  whenToUse: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

function reply(content: string): Response {
  return new Response(
    JSON.stringify({
      model: 'gpt-test',
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200 },
  )
}

interface Sent {
  messages: { role: string; content: string }[]
  response_format?: { json_schema?: { schema?: Record<string, unknown>; strict?: boolean } }
}

/** A client whose endpoint answers from a script, and that records what it was asked. */
function clientWith(
  answers: (string | Response)[],
  features: { jsonSchema?: boolean } = {},
  presetId?: AIClientConfig['presetId'],
) {
  const sent: Sent[] = []
  const fetch = ((_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string) as Sent)
    const next = answers.shift()
    if (next === undefined) throw new Error('No answer left in the script')
    return Promise.resolve(typeof next === 'string' ? reply(next) : next)
  }) as unknown as typeof globalThis.fetch

  const config: AIClientConfig = {
    baseUrl: 'https://example.test/v1',
    model: 'gpt-test',
    features,
    ...(presetId ? { presetId } : {}),
  }
  return { client: createAIClient(config, { fetch }), sent }
}

describe('structured', () => {
  it('asks for a schema when the endpoint supports one', async () => {
    const { client, sent } = clientWith(['{"id":"xunit","name":"xUnit"}'], { jsonSchema: true })
    const result = await structured(client, skill, [{ role: 'user', content: 'a skill' }])

    expect(result.value).toEqual({ id: 'xunit', name: 'xUnit' })
    expect(result.mode).toBe('json-schema')
    expect(result.repaired).toBe(false)
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 })
    // No prompt-side contract: the endpoint is enforcing the shape.
    expect(sent[0]!.messages).toHaveLength(1)
    // Plain by default: only what is genuinely required is required.
    expect(sent[0]!.response_format?.json_schema?.schema).toMatchObject({
      required: ['id', 'name'],
    })
    expect(sent[0]!.response_format?.json_schema?.strict).toBeUndefined()
  })

  it('uses the strict dialect only where the endpoint demands it', async () => {
    // OpenAI requires every property to be required, with optional expressed as "or null".
    // Everywhere else that is pure cost — the model writes every optional field as null, and on
    // a whole-Blueprint schema that was the difference between finishing and not.
    const openai = clientWith(['{"id":"a","name":"A"}'], { jsonSchema: true }, 'openai')
    await structured(openai.client, skill, [{ role: 'user', content: 'a skill' }])
    expect(openai.sent[0]!.response_format?.json_schema?.strict).toBe(true)
    expect(openai.sent[0]!.response_format?.json_schema?.schema).toMatchObject({
      additionalProperties: false,
      required: ['id', 'name', 'whenToUse', 'tags'],
    })

    const local = clientWith(['{"id":"a","name":"A"}'], { jsonSchema: true }, 'lm-studio')
    await structured(local.client, skill, [{ role: 'user', content: 'a skill' }])
    expect(local.sent[0]!.response_format?.json_schema?.strict).toBeUndefined()
    expect(local.sent[0]!.response_format?.json_schema?.schema).toMatchObject({
      required: ['id', 'name'],
    })
  })

  it('puts the schema in the prompt when the endpoint has no schema mode', async () => {
    const { client, sent } = clientWith([
      'Sure! Here you go:\n```json\n{"id":"xunit","name":"xUnit"}\n```\nHope that helps.',
    ])
    const result = await structured(client, skill, [{ role: 'user', content: 'a skill' }])

    expect(result.value).toEqual({ id: 'xunit', name: 'xUnit' })
    expect(result.mode).toBe('prompt')
    expect(sent[0]!.response_format).toBeUndefined()

    // The contract rides on the user's own turn. A second system message after it is rejected
    // outright by templates that require system-first — Qwen is one — and two user messages in
    // a row break the ones that require strict alternation.
    expect(sent[0]!.messages).toHaveLength(1)
    const contract = sent[0]!.messages.at(-1)!
    expect(contract.role).toBe('user')
    expect(contract.content).toContain('a skill')
    expect(contract.content).toContain('"whenToUse"')
  })

  it('leaves one system message at the front when there is one', async () => {
    const { client, sent } = clientWith(['{"id":"a","name":"A"}'])
    await structured(client, skill, [
      { role: 'system', content: 'You write skills.' },
      { role: 'user', content: 'a skill' },
    ])

    expect(sent[0]!.messages.map((message) => message.role)).toEqual(['system', 'user'])
    expect(sent[0]!.messages[0]!.content).toBe('You write skills.')
  })

  it('falls back to the prompt path when the endpoint rejects the schema', async () => {
    // Configured as if it supported schemas — which is what a wrong probe leaves behind.
    const { client, sent } = clientWith(
      [
        new Response('response_format is not supported by this model', { status: 400 }),
        '{"id":"xunit","name":"xUnit"}',
      ],
      { jsonSchema: true },
    )
    const result = await structured(client, skill, [{ role: 'user', content: 'a skill' }])

    expect(result.mode).toBe('prompt')
    expect(result.value.id).toBe('xunit')
    expect(sent[1]!.response_format).toBeUndefined()
  })

  it('drops the schema when the endpoint rejects it without saying why', async () => {
    // a hosted API's OpenAI layer refuses a schema carrying `pattern` or `minLength` with nothing but
    // "Request contains an invalid argument" — no mention of response_format, so matching on the
    // wording would never have caught it. Having sent a schema and been refused, asking again
    // without one costs a single request and is the only move that can work.
    const { client, sent } = clientWith(
      [
        new Response('[{"error":{"code":400,"message":"Request contains an invalid argument."}}]', {
          status: 400,
        }),
        '{"id":"xunit","name":"xUnit"}',
      ],
      { jsonSchema: true },
    )
    const result = await structured(client, skill, [{ role: 'user', content: 'a skill' }])

    expect(result.mode).toBe('prompt')
    expect(result.value.id).toBe('xunit')
    expect(sent[1]!.response_format).toBeUndefined()
  })

  it('does not retry for ever when the prompt path is refused too', async () => {
    const { client, sent } = clientWith(
      [
        new Response('{"error":"nope"}', { status: 400 }),
        new Response('{"error":"nope"}', { status: 400 }),
      ],
      { jsonSchema: true },
    )
    const error = (await structured(client, skill, [{ role: 'user', content: 'a skill' }]).catch(
      (e: unknown) => e,
    )) as AIError

    expect(error.code).toBe('bad-request')
    expect(sent).toHaveLength(2)
  })

  it('repairs once, telling the model which field was wrong', async () => {
    const { client, sent } = clientWith([
      '{"id":"xunit","name":42}',
      '{"id":"xunit","name":"xUnit"}',
    ])
    const result = await structured(client, skill, [{ role: 'user', content: 'a skill' }])

    expect(result.repaired).toBe(true)
    expect(result.value.name).toBe('xUnit')
    const repairPrompt = sent[1]!.messages.at(-1)!.content
    expect(repairPrompt).toContain('name:')
    expect(sent[1]!.messages.at(-2)!.role).toBe('assistant')
  })

  it('gives up after the repair budget, keeping what it was told', async () => {
    const { client, sent } = clientWith(['not json at all', 'still not json'])
    const error = (await structured(client, skill, [{ role: 'user', content: 'a skill' }]).catch(
      (e: unknown) => e,
    )) as AIError

    expect(error).toBeInstanceOf(AIError)
    expect(error.code).toBe('invalid-output')
    expect(error.raw).toBe('still not json')
    expect(sent).toHaveLength(2)
  })

  it('honours a larger repair budget', async () => {
    const { client, sent } = clientWith(['nope', 'nope again', '{"id":"a","name":"A"}'])
    const result = await structured(client, skill, [{ role: 'user', content: 'a skill' }], {
      repairs: 2,
    })
    expect(result.value.id).toBe('a')
    expect(sent).toHaveLength(3)
  })

  it('refuses an answer carrying something shaped like a credential, without re-asking', async () => {
    // Re-asking would produce the same text; the point is that it never reaches a ChangeSet.
    const { client, sent } = clientWith([
      '{"id":"a","name":"A","whenToUse":"call with sk-proj-abcdefghijklmnopqrst"}',
      '{"id":"a","name":"A"}',
    ])
    const error = (await structured(client, skill, [{ role: 'user', content: 'a skill' }]).catch(
      (e: unknown) => e,
    )) as AIError

    expect(error.code).toBe('invalid-output')
    expect(error.message).toContain('credential')
    expect(sent).toHaveLength(1)
    expect(error.raw).not.toContain('sk-proj-abcdefghijklmnopqrst')
  })

  it('accepts the nulls strict mode forces on optional fields', async () => {
    const { client } = clientWith(['{"id":"a","name":"A","whenToUse":null,"tags":null}'], {
      jsonSchema: true,
    })
    const result = await structured(client, skill, [{ role: 'user', content: 'a skill' }])
    expect(result.value).toEqual({ id: 'a', name: 'A' })
  })
})

describe('toStrictJsonSchema', () => {
  it('closes objects and turns optional into nullable, all the way down', () => {
    const nested = z.object({
      name: z.string(),
      inner: z.object({ a: z.string(), b: z.number().optional() }).optional(),
      list: z.array(z.object({ x: z.string().optional() })),
    })
    const strict = toStrictJsonSchema(nested) as Record<string, unknown>
    expect(strict.additionalProperties).toBe(false)
    expect(strict.required).toEqual(['name', 'inner', 'list'])

    const properties = strict.properties as Record<string, Record<string, unknown>>
    expect(properties.inner!.anyOf).toBeDefined()
    const items = (properties.list!.items as Record<string, unknown>) ?? {}
    expect(items.required).toEqual(['x'])
    expect(items.additionalProperties).toBe(false)
  })

  it('leaves the plain schema optional, for the prompt path', () => {
    const plain = toJsonSchema(skill) as Record<string, unknown>
    expect(plain.required).toEqual(['id', 'name'])
    expect(plain.$schema).toBeUndefined()
  })
})

describe('extractJson', () => {
  it('finds the object however it was wrapped', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}')
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(extractJson('prose {"a":{"b":2}} more prose')).toBe('{"a":{"b":2}}')
    // A brace inside a string must not close the object.
    expect(extractJson('{"a":"}"}')).toBe('{"a":"}"}')
    expect(extractJson('{"a":"\\""}')).toBe('{"a":"\\""}')
    expect(extractJson('no object here')).toBeUndefined()
    expect(extractJson('{"a": unbalanced')).toBeUndefined()
  })

  it('keeps the object when the object contains a code fence', () => {
    // The case that broke against a live model: a skill body is Markdown, Markdown has code
    // examples, and stripping fences first threw the real answer away three times in four.
    const body = ['# xUnit', '', '```csharp', '[Fact]', 'public void It_works() { }', '```'].join(
      '\n',
    )
    const answer = JSON.stringify({ artifact: { id: 'xunit', body } })
    expect(extractJson(answer)).toBe(answer)
    expect(JSON.parse(extractJson(answer)!)).toEqual({ artifact: { id: 'xunit', body } })

    // Still fenced overall, and still carrying a fence inside.
    expect(extractJson(['Here:', '```json', answer, '```'].join('\n'))).toBe(answer)
  })

  it('falls back to a fenced block when the prose before it has braces', () => {
    // `{curly}` is the first balanced pair but is not JSON, so the fence is tried next.
    const text = ['Use {curly} braces carefully.', '```json', '{"a":1}', '```'].join('\n')
    expect(extractJson(text)).toBe('{"a":1}')
  })
})

describe('dropNulls', () => {
  it('removes null properties at every depth but keeps everything else', () => {
    expect(dropNulls({ a: 1, b: null, c: { d: null, e: [1, { f: null, g: 2 }] } })).toEqual({
      a: 1,
      c: { e: [1, { g: 2 }] },
    })
  })
})

describe('token budget', () => {
  it('estimates and truncates with a mark the model can see', () => {
    expect(estimateTokens('x'.repeat(350))).toBe(100)
    const long = 'a'.repeat(1000)
    const cut = truncateToTokens(long, 50)
    expect(cut).toContain('[… truncated …]')
    expect(estimateTokens(cut)).toBeLessThanOrEqual(50)
    expect(truncateToTokens('short', 100)).toBe('short')
  })
})
