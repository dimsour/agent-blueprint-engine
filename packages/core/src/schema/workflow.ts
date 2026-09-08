import { z } from 'zod'

import {
  entityBaseSchema,
  markdownBodySchema,
  slugListSchema,
  slugSchema,
  stringListSchema,
} from './common'

export const WORKFLOW_NODE_TYPES = [
  'start',
  'end',
  'agent',
  'skill',
  'tool',
  'condition',
  'verification',
  'review',
  'gate',
  'human-approval',
  'output',
  'parallel',
  'merge',
  'retry',
  'delegate',
  'synthesis',
] as const
export const workflowNodeTypeSchema = z.enum(WORKFLOW_NODE_TYPES)

export const WORKFLOW_EDGE_KINDS = [
  'sequential',
  'parallel',
  'conditional',
  'fallback',
  'retry',
  'delegation',
  'review',
  'aggregation',
] as const
export const workflowEdgeKindSchema = z.enum(WORKFLOW_EDGE_KINDS)

export const MERGE_STRATEGIES = ['all', 'any', 'first', 'synthesize'] as const
export const VERIFICATION_METHODS = ['command', 'tests', 'review', 'manual'] as const
export const NODE_FAILURE_BEHAVIORS = ['stop', 'continue', 'fallback', 'retry'] as const

/**
 * Node configuration is a flat bag of optional fields rather than a discriminated union so
 * that a node can change type in the editor without losing settings. Validation rules
 * report fields that are missing for a given node type (e.g. an `agent` node without
 * `agentId`).
 */
export const workflowNodeConfigSchema = z.object({
  agentId: slugSchema.optional(),
  skillId: slugSchema.optional(),
  toolId: slugSchema.optional(),
  gateId: slugSchema.optional(),
  /** What context the step receives (free text: "the plan", "changed files", …). */
  contextInputs: stringListSchema,
  /** What the step must produce. */
  outputSpec: z.string().optional(),
  /** Condition nodes: human-readable predicate. */
  expression: z.string().optional(),
  mergeStrategy: z.enum(MERGE_STRATEGIES).optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  verification: z
    .object({
      method: z.enum(VERIFICATION_METHODS),
      command: z.string().optional(),
    })
    .optional(),
  approvalPrompt: z.string().optional(),
  onFailure: z.enum(NODE_FAILURE_BEHAVIORS).optional(),
})

export const workflowNodeSchema = z.object({
  id: slugSchema,
  type: workflowNodeTypeSchema,
  label: z.string().min(1).max(200),
  description: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: workflowNodeConfigSchema.prefault({}),
})

export const workflowEdgeSchema = z.object({
  id: slugSchema,
  from: slugSchema,
  to: slugSchema,
  kind: workflowEdgeKindSchema.default('sequential'),
  /** Required edges must complete for the workflow to proceed; optional ones may be skipped. */
  required: z.boolean().default(true),
  /** For conditional edges: when this branch is taken. */
  condition: z.string().optional(),
  label: z.string().optional(),
})

export const workflowTriggersSchema = z.object({
  intents: stringListSchema,
  agentIds: slugListSchema,
})

export const workflowSchema = entityBaseSchema.extend({
  entryNodeId: slugSchema.optional(),
  nodes: z.array(workflowNodeSchema).default([]),
  edges: z.array(workflowEdgeSchema).default([]),
  triggers: workflowTriggersSchema.prefault({}),
  /** Prose description of the workflow, compiled into the orchestration skill. */
  body: markdownBodySchema,
})
