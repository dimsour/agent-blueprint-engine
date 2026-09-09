/**
 * What a model is allowed to write.
 *
 * These are the core entity schemas with the fields the model has no business setting taken
 * out — `metadata`, which the project reader owns and uses to preserve unknown keys across a
 * round trip, and a workflow step's `position`, which is a drawing decision the application
 * makes. Everything else is asked for exactly as core defines it, so there is one definition
 * of a Skill and not a second one phrased for prompts (AGENTS.md rule 7).
 *
 * The result is still not trusted: whatever comes back is parsed a second time by the real
 * schema before it becomes a ChangeSet op.
 */
import {
  agentSchema,
  type EntityKind,
  gateSchema,
  hookSchema,
  ironLawSchema,
  memoryDefinitionSchema,
  referenceSchema,
  requirementSchema,
  ruleSchema,
  scenarioSchema,
  skillSchema,
  toolSchema,
  workflowNodeSchema,
  workflowSchema,
} from '@agent-blueprint/core'
import { z } from 'zod'

/** A step without a position: where it sits on the canvas is laid out deterministically. */
export const aiWorkflowNodeSchema = workflowNodeSchema.omit({ position: true })

export const AI_ENTITY_SCHEMAS = {
  agent: agentSchema.omit({ metadata: true }),
  skill: skillSchema.omit({ metadata: true }),
  workflow: workflowSchema
    .omit({ metadata: true })
    .extend({ nodes: z.array(aiWorkflowNodeSchema).default([]) }),
  'iron-law': ironLawSchema.omit({ metadata: true }),
  rule: ruleSchema.omit({ metadata: true }),
  hook: hookSchema.omit({ metadata: true }),
  gate: gateSchema.omit({ metadata: true }),
  tool: toolSchema.omit({ metadata: true }),
  reference: referenceSchema.omit({ metadata: true }),
  memory: memoryDefinitionSchema.omit({ metadata: true }),
  requirement: requirementSchema.omit({ metadata: true }),
  scenario: scenarioSchema.omit({ metadata: true }),
} as const satisfies Record<EntityKind, z.ZodObject>

export type AiEntitySchemaMap = typeof AI_ENTITY_SCHEMAS

export function aiEntitySchemaFor<K extends EntityKind>(kind: K): AiEntitySchemaMap[K] {
  return AI_ENTITY_SCHEMAS[kind]
}
