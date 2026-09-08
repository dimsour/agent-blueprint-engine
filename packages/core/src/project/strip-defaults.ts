/**
 * Remove values that equal their schema default, recursively, so that written files only
 * contain what the author actually decided. The reader restores the defaults through the
 * same schema, which keeps read → write → read lossless.
 *
 * Walks Zod 4 definitions structurally: `default`/`prefault` wrappers are compared against
 * their (normalized) default value, `optional` and `object`/`array` are traversed, and every
 * other schema is a leaf that is kept verbatim.
 */
import type { z } from 'zod'

import { canonicalJson } from './serialize'

type AnySchema = z.ZodType

interface SchemaDef {
  readonly type: string
  readonly innerType?: AnySchema
  readonly defaultValue?: unknown
  readonly shape?: Record<string, AnySchema>
  readonly element?: AnySchema
}

function defOf(schema: AnySchema): SchemaDef {
  return (schema as unknown as { def: SchemaDef }).def
}

function sameValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b)
}

export function stripDefaults(value: unknown, schema: AnySchema): unknown {
  if (value === undefined) return undefined
  const def = defOf(schema)
  switch (def.type) {
    case 'default': {
      if (sameValue(value, def.defaultValue)) return undefined
      return def.innerType ? stripDefaults(value, def.innerType) : value
    }
    case 'prefault': {
      // A prefault default is *input*; normalize it through the inner schema before comparing.
      const inner = def.innerType
      const normalizedDefault = inner ? inner.parse(def.defaultValue) : def.defaultValue
      if (sameValue(value, normalizedDefault)) return undefined
      return inner ? stripDefaults(value, inner) : value
    }
    case 'optional':
    case 'nullable':
    case 'readonly':
      return def.innerType ? stripDefaults(value, def.innerType) : value
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value) || !def.shape)
        return value
      const record = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [key, fieldSchema] of Object.entries(def.shape)) {
        if (!(key in record)) continue
        const stripped = stripDefaults(record[key], fieldSchema)
        if (stripped !== undefined) out[key] = stripped
      }
      // keys outside the shape (catchall / passthrough) are kept as they are
      for (const key of Object.keys(record))
        if (!(key in def.shape) && record[key] !== undefined) out[key] = record[key]
      return out
    }
    case 'array': {
      if (!Array.isArray(value) || !def.element) return value
      const element = def.element
      return (value as unknown[]).map((item) => {
        const stripped = stripDefaults(item, element)
        return stripped === undefined ? item : stripped
      })
    }
    default:
      return value
  }
}
