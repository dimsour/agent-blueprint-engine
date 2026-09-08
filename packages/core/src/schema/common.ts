import { z } from 'zod'

import { SLUG_MAX_LENGTH, SLUG_RE } from '../model/ids'
import type { JsonValue } from '../model/json'

export const slugSchema = z
  .string()
  .min(1)
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_RE, 'must be kebab-case: lowercase letters, digits and single hyphens')

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema)

export const semverSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    'must be a semantic version such as 1.2.0',
  )

/** Markdown body of an artifact. Normalized: LF line endings, no trailing whitespace. */
export const markdownBodySchema = z.string().default('')

export const slugListSchema = z.array(slugSchema).default([])
export const stringListSchema = z.array(z.string().min(1)).default([])

/**
 * Fields shared by every entity. `id` is the slug (also the file name), `name` is the
 * human display name. Unknown top-level keys found in source files are preserved under
 * `metadata` by the project reader so that round-trips do not lose information.
 */
export const entityBaseSchema = z.object({
  id: slugSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  tags: stringListSchema,
  metadata: jsonObjectSchema.default({}),
})

export const AGENT_ROLES = [
  'worker',
  'reviewer',
  'researcher',
  'investigator',
  'architect',
  'verifier',
  'orchestrator',
] as const
export const agentRoleSchema = z.enum(AGENT_ROLES)

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const
export const severitySchema = z.enum(SEVERITIES)

export const GOVERNANCE_CATEGORIES = [
  'security',
  'testing',
  'architecture',
  'reliability',
  'data',
  'code-quality',
  'communication',
  'process',
  'general',
] as const
export const governanceCategorySchema = z.enum(GOVERNANCE_CATEGORIES)

/**
 * Where a governance artifact (Iron Law, Rule) applies. `all: true` means every agent
 * and workflow; otherwise only the listed ids.
 */
export const scopeSchema = z.object({
  all: z.boolean().default(true),
  agentIds: slugListSchema,
  workflowIds: slugListSchema,
})

export const TOOL_KINDS = [
  'filesystem',
  'shell',
  'git',
  'browser',
  'search',
  'database',
  'api',
  'documentation',
  'mcp',
  'custom',
] as const
export const toolKindSchema = z.enum(TOOL_KINDS)

/** A relative path inside an artifact directory: no absolute paths, no `..` segments. */
export const relativePathSchema = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split('/').includes('..'),
    'must be a relative path without ".." segments',
  )
