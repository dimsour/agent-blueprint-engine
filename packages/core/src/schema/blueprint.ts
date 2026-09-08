import { z } from 'zod'

import { type BlueprintCollectionKey, HARNESS_IDS } from '../model/kinds'
import { agentSchema } from './agent'
import { jsonObjectSchema, semverSchema, slugSchema } from './common'
import { gateSchema, hookSchema, ironLawSchema, ruleSchema } from './governance'
import { memoryDefinitionSchema, referenceSchema, toolSchema } from './knowledge'
import { requirementSchema, scenarioSchema } from './quality'
import { skillSchema } from './skill'
import { workflowSchema } from './workflow'

export const BLUEPRINT_SCHEMA_VERSION = '1.0' as const

export const harnessIdSchema = z.enum(HARNESS_IDS)

export const targetConfigSchema = z.object({
  harnessId: harnessIdSchema,
  enabled: z.boolean().default(true),
  /** Harness-specific options; validated by the adapter's own schema at compile time. */
  options: jsonObjectSchema.default({}),
})

export const DEFAULT_SOURCE_DIR = 'blueprint'

export const sourceDirSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/, 'must be a relative directory path')
  .refine((p) => !p.split('/').includes('..'), 'must not contain ".." segments')

export const blueprintSettingsSchema = z.object({
  /** The agent whose persona becomes the root instruction file; others compile to subagents. */
  primaryAgentId: slugSchema.optional(),
  /** Directory (relative to the repository root) holding the source-of-truth project. */
  sourceDir: sourceDirSchema.default(DEFAULT_SOURCE_DIR),
})

export const blueprintCollectionsSchema = z.object({
  agents: z.array(agentSchema).default([]),
  skills: z.array(skillSchema).default([]),
  workflows: z.array(workflowSchema).default([]),
  ironLaws: z.array(ironLawSchema).default([]),
  rules: z.array(ruleSchema).default([]),
  hooks: z.array(hookSchema).default([]),
  gates: z.array(gateSchema).default([]),
  tools: z.array(toolSchema).default([]),
  references: z.array(referenceSchema).default([]),
  memories: z.array(memoryDefinitionSchema).default([]),
  requirements: z.array(requirementSchema).default([]),
  scenarios: z.array(scenarioSchema).default([]),
})

/** Project-level fields (everything that is not an entity collection). */
export const blueprintHeaderSchema = z.object({
  schemaVersion: z.literal(BLUEPRINT_SCHEMA_VERSION),
  id: slugSchema,
  name: z.string().min(1).max(200),
  version: semverSchema.default('0.1.0'),
  description: z.string().max(4000).optional(),
  settings: blueprintSettingsSchema.prefault({}),
  targets: z.array(targetConfigSchema).default([]),
})

export const blueprintSchema = blueprintHeaderSchema.extend(blueprintCollectionsSchema.shape)

/**
 * `blueprint.yaml` — the manifest written to disk. Entity collections are replaced by
 * ordered id lists; the entities themselves live in their own files.
 */
export const manifestSchema = blueprintHeaderSchema.extend({
  artifacts: z
    .object(
      Object.fromEntries(
        Object.keys(blueprintCollectionsSchema.shape).map((key) => [
          key,
          z.array(slugSchema).default([]),
        ]),
      ) as Record<BlueprintCollectionKey, z.ZodDefault<z.ZodArray<typeof slugSchema>>>,
    )
    .prefault({}),
})

// Compile-time guard: every collection key in model/kinds.ts must exist on the schema.
type SchemaCollectionKey = keyof typeof blueprintCollectionsSchema.shape
type _AssertKeysMatch = [
  Exclude<BlueprintCollectionKey, SchemaCollectionKey>,
  Exclude<SchemaCollectionKey, BlueprintCollectionKey>,
] extends [never, never]
  ? true
  : never
const _keysMatch: _AssertKeysMatch = true
void _keysMatch
