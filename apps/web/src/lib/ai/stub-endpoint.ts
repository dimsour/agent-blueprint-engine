/**
 * An endpoint that answers from a script, for tests. Not imported by the app.
 *
 * It exists because the app streams by default, and a fake that replies to a streaming request
 * with a whole completion is answering in a shape no endpoint produces — the test then passes
 * or fails for reasons that have nothing to do with the screen under test. This one reads the
 * request and answers the way it was asked, so a test covers whichever path the settings chose.
 */
const BREAK = '\n\n'

function event(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}${BREAK}`
}

/** The whole answer, in three chunks, as `stream: true` would deliver it. */
function streamed(content: string): Response {
  const size = Math.max(1, Math.ceil(content.length / 3))
  const parts =
    content.length < 3
      ? [content]
      : [content.slice(0, size), content.slice(size, size * 2), content.slice(size * 2)]

  const body = parts
    .map((delta) => event({ choices: [{ delta: { content: delta } }] }))
    .concat(event({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }))
    .join('')

  return new Response(`${body}data: [DONE]${BREAK}`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function whole(content: string): Response {
  return new Response(
    JSON.stringify({
      model: 'stub',
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200 },
  )
}

/**
 * One answer, in whichever shape the request asked for.
 *
 * A string is sent as it is; anything else is serialised, which is what the operations expect
 * back from a model asked for a shape. Exported for the tests that script several calls and
 * only want the endpoint's manners, not its script.
 */
export function answerFor(content: unknown, init?: RequestInit): Response {
  const answer = typeof content === 'string' ? content : JSON.stringify(content)
  const streaming =
    typeof init?.body === 'string' &&
    (JSON.parse(init.body) as { stream?: boolean }).stream === true
  return streaming ? streamed(answer) : whole(answer)
}

/** Replaces `globalThis.fetch` with an endpoint that always answers `content`. */
export function stubEndpoint(content: unknown): void {
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    Promise.resolve(answerFor(content, init))) as unknown as typeof globalThis.fetch
}
