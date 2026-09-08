export * from './common'
export * from './agent'
export * from './skill'
export * from './workflow'
export * from './governance'
export * from './knowledge'
export * from './quality'
export * from './blueprint'

import type { z } from 'zod'

import type { EntityKind } from '../model/kinds'
import { agentSchema } from './agent'
import { gateSchema, hookSchema, ironLawSchema, ruleSchema } from './governance'
import { memoryDefinitionSchema, referenceSchema, toolSchema } from './knowledge'
import { requirementSchema, scenarioSchema } from './quality'
import { skillSchema } from './skill'
import { workflowSchema } from './workflow'

/** Schema for each entity kind, used generically by the project reader/writer and change-sets. */
export const ENTITY_SCHEMAS = {
  agent: agentSchema,
  skill: skillSchema,
  workflow: workflowSchema,
  'iron-law': ironLawSchema,
  rule: ruleSchema,
  hook: hookSchema,
  gate: gateSchema,
  tool: toolSchema,
  reference: referenceSchema,
  memory: memoryDefinitionSchema,
  requirement: requirementSchema,
  scenario: scenarioSchema,
} as const satisfies Record<EntityKind, z.ZodObject>

export type EntitySchemaMap = typeof ENTITY_SCHEMAS

export function entitySchemaFor<K extends EntityKind>(kind: K): EntitySchemaMap[K] {
  return ENTITY_SCHEMAS[kind]
}
