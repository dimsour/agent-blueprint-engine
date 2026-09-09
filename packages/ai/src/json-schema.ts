/**
 * Turning a Zod schema into something an endpoint will accept, and reading the answer back.
 *
 * Two shapes are needed, because there are two ways to ask for structure. An endpoint with
 * JSON-schema support wants OpenAI's strict dialect, which is narrower than JSON Schema: every
 * object must close itself to extra keys and list *every* property as required, so an optional
 * field has to be expressed as "or null" instead. An endpoint without it gets the ordinary
 * schema pasted into the prompt, and answers with prose around the JSON as often as not.
 *
 * `dropNulls` is the price of the strict dialect: what comes back has explicit nulls where the
 * Zod schema has optional fields, and Zod would reject those. No core schema uses `.nullable()`,
 * so "null means absent" is unambiguous here.
 */
import * as z from 'zod'

export type JsonSchemaObject = Record<string, unknown>

/** The plain JSON Schema for a Zod type, as the input side sees it (defaults not applied). */
export function toJsonSchema(schema: z.ZodType): JsonSchemaObject {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchemaObject
  delete json.$schema
  return json
}

/** The same schema in OpenAI's strict dialect. */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchemaObject {
  return strictify(toJsonSchema(schema)) as JsonSchemaObject
}

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify)
  if (node === null || typeof node !== 'object') return node

  const source = node as JsonSchemaObject
  const out: JsonSchemaObject = {}
  for (const [key, value] of Object.entries(source)) out[key] = strictify(value)

  const properties = out.properties
  if (properties === undefined || typeof properties !== 'object') return out

  const keys = Object.keys(properties as JsonSchemaObject)
  const required = new Set(Array.isArray(out.required) ? (out.required as string[]) : [])
  // Strict mode has no notion of an optional property, only of one that may be null.
  for (const key of keys) {
    if (required.has(key)) continue
    const property = (properties as JsonSchemaObject)[key]
    ;(properties as JsonSchemaObject)[key] = { anyOf: [property, { type: 'null' }] }
  }
  out.required = keys
  // A record ({ [k: string]: T }) already says what extra keys hold; do not close it.
  if (out.additionalProperties === undefined) out.additionalProperties = false
  return out
}

/** Remove `null`-valued properties, so a strict-mode answer parses against optional fields. */
export function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls)
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === null) continue
    out[key] = dropNulls(item)
  }
  return out
}

/**
 * Find the JSON object in a model's answer.
 *
 * Models fence it, introduce it, and apologise after it. Scanning for the first balanced
 * `{…}` outside a string literal survives all three, and gives up rather than guessing when
 * the braces never balance.
 */
export function extractJson(text: string): string | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const haystack = fenced?.[1] ?? text
  const start = haystack.indexOf('{')
  if (start === -1) return undefined

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < haystack.length; i += 1) {
    const char = haystack[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && inString) {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return haystack.slice(start, i + 1)
    }
  }
  return undefined
}

/** Zod's complaints as `path: message` lines, which is what a model can act on. */
export function issueLines(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}
