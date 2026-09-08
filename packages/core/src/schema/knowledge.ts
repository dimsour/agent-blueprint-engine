import { z } from 'zod'

import { entityBaseSchema, markdownBodySchema, stringListSchema, toolKindSchema } from './common'

// ---------------------------------------------------------------------------
// Tools — capabilities available to agents (what an agent *can* do; permissions say what it *may* do).
// ---------------------------------------------------------------------------

export const MCP_TRANSPORTS = ['stdio', 'http', 'sse'] as const

export const mcpServerSchema = z.object({
  transport: z.enum(MCP_TRANSPORTS),
  command: z.string().optional(),
  args: stringListSchema,
  url: z.string().url().optional(),
  /** Environment variable *names* the server needs. Values are never stored in a Blueprint. */
  envVars: stringListSchema,
})

export const toolSchema = entityBaseSchema.extend({
  kind: toolKindSchema,
  /** Operations this tool offers, e.g. `read`, `write`, `query`; free text per tool. */
  operations: stringListSchema,
  mcp: mcpServerSchema.optional(),
})

// ---------------------------------------------------------------------------
// References — deep knowledge, kept apart from concise operational skills.
// ---------------------------------------------------------------------------

export const REFERENCE_KINDS = [
  'markdown',
  'text',
  'example',
  'documentation',
  'domain-knowledge',
  'url',
] as const

export const referenceSchema = entityBaseSchema.extend({
  kind: z.enum(REFERENCE_KINDS).default('markdown'),
  url: z.string().url().optional(),
  body: markdownBodySchema,
})

// ---------------------------------------------------------------------------
// Memory — what an agent accumulates across sessions.
// ---------------------------------------------------------------------------

export const MEMORY_SCOPES = ['stateless', 'session', 'project', 'persistent'] as const

export const memoryDefinitionSchema = entityBaseSchema.extend({
  scope: z.enum(MEMORY_SCOPES),
  /** What is worth remembering: "architectural decisions", "discovered conventions", … */
  categories: stringListSchema,
  /** Seed knowledge written into the compiled memory file where the harness supports it. */
  body: markdownBodySchema,
})
