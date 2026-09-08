/**
 * Deterministic text encodings. The Git-friendliness of a generated project depends on
 * these being stable: same value in → same bytes out, always.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import type { JsonValue } from '../model/json'

/** JSON with sorted object keys, 2-space indent and a trailing newline. */
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`
}

/**
 * JSON in insertion order, 2-space indent and a trailing newline. Use for values that have
 * already been ordered by a schema (parsed output), where schema order reads better than
 * alphabetical order.
 */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeysDeep(v)]))
  }
  return value
}

/**
 * YAML in insertion order (callers pass objects already in schema key order), no line
 * wrapping, block scalars for multi-line strings, trailing newline.
 */
export function toYaml(value: unknown): string {
  return stringifyYaml(value, {
    lineWidth: 0,
    indent: 2,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN',
    blockQuote: 'literal',
    aliasDuplicateObjects: false,
  })
}

export function fromYaml(text: string): unknown {
  return parseYaml(text, { uniqueKeys: true, strict: true }) as unknown
}

/**
 * Remove `undefined`, empty strings, empty arrays and empty objects recursively. Used before
 * writing so that schema defaults never clutter files. Booleans and numbers are kept.
 */
export function pruneEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(pruneEmpty).filter((item) => item !== undefined)
    return items.length === 0 ? undefined : items
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, pruneEmpty(v)] as const)
      .filter(([, v]) => v !== undefined)
    return entries.length === 0 ? undefined : Object.fromEntries(entries)
  }
  if (value === '' || value === undefined) return undefined
  return value
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/

export interface FrontmatterDocument {
  data: Record<string, unknown>
  body: string
}

/**
 * `---\n<yaml>---\n\n<body>\n`. The frontmatter block is always present so that files are
 * uniform; an empty body yields a file that ends right after the closing `---`.
 */
export function encodeFrontmatter(data: Record<string, unknown>, body: string): string {
  const yaml = Object.keys(data).length === 0 ? '' : toYaml(data)
  const head = `---\n${yaml}---\n`
  return body.length === 0 ? head : `${head}\n${body}\n`
}

export function decodeFrontmatter(text: string): FrontmatterDocument {
  const source = text.replace(/\r\n?/g, '\n')
  const match = FRONTMATTER_RE.exec(source)
  if (!match) return { data: {}, body: source.replace(/\n+$/, '') }
  const raw = match[1] ?? ''
  const parsed = raw.trim().length === 0 ? {} : fromYaml(raw)
  if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
    throw new Error('Frontmatter must be a YAML mapping')
  }
  const data = (parsed ?? {}) as Record<string, unknown>
  let body = source.slice(match[0].length)
  if (body.startsWith('\n')) body = body.slice(1)
  return { data, body: body.replace(/\n+$/, '') }
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return true
  if (typeof value !== 'object') return false
  return Array.isArray(value)
    ? value.every(isJsonValue)
    : Object.values(value as Record<string, unknown>).every(isJsonValue)
}

/** SHA-256 hex digest via Web Crypto (available in browsers and Node ≥ 20). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
