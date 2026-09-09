/**
 * Server-sent events, as chat endpoints send them.
 *
 * The stream arrives in arbitrary chunks, so a `data:` line can be split across two reads.
 * The parser therefore keeps a buffer and only emits complete lines, and stops at `[DONE]`.
 */

/** Split a stream of text chunks into the JSON payload of each `data:` line. */
export async function* sseData(
  chunks: AsyncIterable<string> | Iterable<string>,
): AsyncIterable<string> {
  let buffer = ''
  for await (const chunk of chunks) {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      const payload = dataOf(line)
      if (payload === '[DONE]') return
      if (payload !== undefined) yield payload
      newline = buffer.indexOf('\n')
    }
  }
  const payload = dataOf(buffer.replace(/\r$/, ''))
  if (payload !== undefined && payload !== '[DONE]') yield payload
}

function dataOf(line: string): string | undefined {
  if (!line.startsWith('data:')) return undefined
  const payload = line.slice('data:'.length).trim()
  return payload === '' ? undefined : payload
}

/** Decode a byte stream to text chunks. */
export async function* decodeChunks(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder()
  const reader = body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) yield decoder.decode(value, { stream: true })
    }
    const tail = decoder.decode()
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}
