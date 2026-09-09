import { z } from 'zod'

import { ENTITY_KINDS } from '../model/kinds'
import { entityBaseSchema, markdownBodySchema, slugSchema, stringListSchema } from './common'
import { GATE_CRITERION_KINDS, HOOK_ACTION_TYPES, HOOK_TRIGGERS } from './governance'
import { WORKFLOW_NODE_TYPES } from './workflow'

/**
 * Declarative checks the validator can evaluate against a Blueprint. They make
 * "requirement satisfied / partially satisfied / not satisfied" a computed fact rather than
 * an opinion. `ai-judged` is the escape hatch for checks that need a model.
 */
export const requirementCheckSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('workflow-has-node-type'),
    nodeType: z.enum(WORKFLOW_NODE_TYPES),
    /** Restrict to one workflow; otherwise any workflow satisfies the check. */
    workflowId: slugSchema.optional(),
  }),
  z.object({
    type: z.literal('iron-law-matches'),
    /** Case-insensitive regular expression tested against law name, rule and body. */
    pattern: z.string().min(1),
  }),
  z.object({
    type: z.literal('hook-exists'),
    trigger: z.enum(HOOK_TRIGGERS).optional(),
    actionType: z.enum(HOOK_ACTION_TYPES).optional(),
  }),
  z.object({
    type: z.literal('gate-exists'),
    criterionKind: z.enum(GATE_CRITERION_KINDS).optional(),
  }),
  z.object({
    type: z.literal('agent-has-skill-tag'),
    agentId: slugSchema.optional(),
    tag: z.string().min(1),
  }),
  z.object({
    type: z.literal('text-mentions'),
    kinds: z.array(z.enum(ENTITY_KINDS)).default([]),
    pattern: z.string().min(1),
  }),
  z.object({
    type: z.literal('ai-judged'),
    prompt: z.string().min(1),
  }),
])

/** The check types, for a UI that has to offer them. */
export const REQUIREMENT_CHECK_TYPES = [
  'workflow-has-node-type',
  'iron-law-matches',
  'hook-exists',
  'gate-exists',
  'agent-has-skill-tag',
  'text-mentions',
  'ai-judged',
] as const

// Compile-time guard: the list above and the union above it must name the same types.
type SchemaCheckType = z.infer<typeof requirementCheckSchema>['type']
type _AssertCheckTypesMatch = [
  Exclude<SchemaCheckType, (typeof REQUIREMENT_CHECK_TYPES)[number]>,
  Exclude<(typeof REQUIREMENT_CHECK_TYPES)[number], SchemaCheckType>,
] extends [never, never]
  ? true
  : never
const _checkTypesMatch: _AssertCheckTypesMatch = true
void _checkTypesMatch

export const REQUIREMENT_LEVELS = ['must', 'should'] as const

export const requirementSchema = entityBaseSchema.extend({
  statement: z.string().min(1),
  level: z.enum(REQUIREMENT_LEVELS).default('must'),
  checks: z.array(requirementCheckSchema).default([]),
  body: markdownBodySchema,
})

// ---------------------------------------------------------------------------
// Scenarios — behavioural test cases. Runtime simulation is deferred; the shape is not.
// ---------------------------------------------------------------------------

export const SCENARIO_MODES = ['manual', 'ai-judge', 'runtime'] as const

export const expectedBehaviorSchema = z.object({
  description: z.string().min(1),
  check: requirementCheckSchema.optional(),
})

export const scenarioSchema = entityBaseSchema.extend({
  agentId: slugSchema.optional(),
  /** The user request the agent is given. */
  input: z.string().min(1),
  expectedBehaviors: z.array(expectedBehaviorSchema).default([]),
  mode: z.enum(SCENARIO_MODES).default('manual'),
  notes: stringListSchema,
})
