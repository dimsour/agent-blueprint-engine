import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { type Blueprint, MemoryFs, readProject } from '@agent-blueprint/core'

import { createAIClient } from '../src/index'

/** The same fixture project every other package tests against. */
export async function loadFixture(): Promise<Blueprint> {
  const result = await readProject(new MemoryFs(readFixtureFiles('dotnet-testing-expert')))
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length > 0) {
    throw new Error(errors.map((error) => `${error.code} ${error.message}`).join('\n'))
  }
  return result.blueprint
}

/**
 * A client that answers from a recording instead of an endpoint.
 *
 * Recordings live in `tests/__recordings__` and hold what a model actually said, so the
 * operations are tested against real output — including the parts of it that are wrong.
 */
export function replayClient(
  responses: string[],
  features: { jsonSchema?: boolean } = {},
  /** Set to refuse `stream: true` with a 400, the way an endpoint without SSE would. */
  options: { streaming?: boolean } = {},
) {
  const queue = [...responses]
  const sent: { messages: { role: string; content: string }[]; stream?: boolean }[] = []
  const fetch = ((_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as {
      messages: { role: string; content: string }[]
      stream?: boolean
    }
    sent.push(request)

    // An endpoint answers a streaming request as a stream. Replying with a whole completion
    // instead would test a shape no endpoint produces, and hide whichever path was taken.
    if (request.stream === true && options.streaming === false) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Streaming is not supported.' } }), {
          status: 400,
        }),
      )
    }

    const content = queue.shift()
    if (content === undefined) throw new Error('The recording has no further answers.')

    if (request.stream === true) {
      return Promise.resolve(
        new Response(sseBody(content), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          model: 'recorded',
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        }),
        { status: 200 },
      ),
    )
  }) as unknown as typeof globalThis.fetch

  return {
    client: createAIClient(
      { baseUrl: 'https://recorded.test/v1', model: 'recorded', features },
      { fetch },
    ),
    sent,
  }
}

/** Load a recording: the answers a model gave, in order. */
export function recording(name: string): string[] {
  const path = join(dirname(fileURLToPath(import.meta.url)), '__recordings__', `${name}.json`)
  const file = JSON.parse(readFileSync(path, 'utf8')) as { answers: unknown[] }
  return file.answers.map((answer) =>
    typeof answer === 'string' ? answer : JSON.stringify(answer),
  )
}

/**
 * The body an OpenAI-compatible endpoint streams for one answer.
 *
 * In several chunks, split on character count so it works for JSON and prose alike: one chunk
 * would never catch a consumer that assumes the whole answer arrives at once. The usage event
 * comes last and carries no content, which is what `stream_options.include_usage` produces.
 */
export function sseBody(content: string): string {
  const size = Math.max(1, Math.ceil(content.length / 3))
  const parts =
    content.length < 3
      ? [content]
      : [content.slice(0, size), content.slice(size, size * 2), content.slice(size * 2)]

  const chunks = parts.map((delta) => event({ choices: [{ delta: { content: delta } }] }))
  // The same numbers the non-streaming fake reports, so a test can assert usage without
  // caring which path produced the answer.
  const usage = event({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })
  return `${chunks.join('')}${usage}data: [DONE]${BREAK}`
}

const BREAK = '\n\n'

function event(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}${BREAK}`
}
