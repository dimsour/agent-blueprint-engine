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
export function replayClient(responses: string[], features: { jsonSchema?: boolean } = {}) {
  const queue = [...responses]
  const sent: { messages: { role: string; content: string }[] }[] = []
  const fetch = ((_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string) as { messages: { role: string; content: string }[] })
    const content = queue.shift()
    if (content === undefined) throw new Error('The recording has no further answers.')
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
