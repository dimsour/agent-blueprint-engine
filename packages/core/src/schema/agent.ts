import { z } from 'zod'

import {
  agentRoleSchema,
  entityBaseSchema,
  markdownBodySchema,
  slugListSchema,
  slugSchema,
  stringListSchema,
} from './common'

/**
 * Permissions are abstract operations, independent of any harness. Each adapter lowers
 * them to its own syntax (Claude `permissions.allow/ask/deny`, Codex `approval_policy`
 * and `sandbox_mode`, OpenCode `permission`, Copilot tool allowlists).
 *
 * "Agent knows how to do something" (skills, tools) is deliberately separate from
 * "agent is allowed to do something" (permissions).
 */
export const PERMISSION_OPERATIONS = [
  'fs.read',
  'fs.write',
  'fs.delete',
  'shell.readonly',
  'shell.mutating',
  'git.read',
  'git.commit',
  'git.push',
  'git.force-push',
  'net.docs',
  'net.any',
  'mcp',
] as const
export const permissionOperationSchema = z.enum(PERMISSION_OPERATIONS)

export const PERMISSION_DECISIONS = ['allow', 'ask', 'deny'] as const
export const permissionDecisionSchema = z.enum(PERMISSION_DECISIONS)

export const permissionPatternSchema = z.object({
  operation: permissionOperationSchema,
  /** Harness-agnostic glob or command prefix, e.g. `git push *`, `src/**`, `docs.example.com`. */
  pattern: z.string().min(1),
  decision: permissionDecisionSchema,
})

export const permissionSetSchema = z.object({
  /** Blanket decision per operation. Unset operations fall back to the harness default. */
  operations: z.partialRecord(permissionOperationSchema, permissionDecisionSchema).default({}),
  /** Finer-grained overrides evaluated before `operations`. */
  patterns: z.array(permissionPatternSchema).default([]),
})

export const MODEL_PREFERENCES = ['fast', 'balanced', 'strong'] as const
export const modelPreferenceSchema = z.object({
  preference: z.enum(MODEL_PREFERENCES),
  /** Optional free-text hint such as a concrete model id the user prefers. */
  hint: z.string().optional(),
})

export const EFFORT_LEVELS = ['low', 'medium', 'high'] as const

/**
 * How hard the agent may think and how long it may run. Harness-neutral: Claude Code has
 * `effort` and `maxTurns`, Codex has `model_reasoning_effort`; the rest are told.
 */
export const agentBudgetSchema = z.object({
  effort: z.enum(EFFORT_LEVELS).optional(),
  /** Tool-call turns before the agent must stop and report. */
  maxTurns: z.number().int().min(1).max(1000).optional(),
})

export const agentSchema = entityBaseSchema.extend({
  role: agentRoleSchema,
  expertise: stringListSchema,
  responsibilities: stringListSchema,
  skillIds: slugListSchema,
  workflowIds: slugListSchema,
  ironLawIds: slugListSchema,
  ruleIds: slugListSchema,
  toolIds: slugListSchema,
  referenceIds: slugListSchema,
  memoryIds: slugListSchema,
  permissions: permissionSetSchema.prefault({}),
  outputRequirements: stringListSchema,
  model: modelPreferenceSchema.optional(),
  budget: agentBudgetSchema.optional(),
  delegation: z
    .object({
      canDelegateTo: z.array(slugSchema).default([]),
    })
    .optional(),
  /** Persona / system prompt in Markdown. */
  body: markdownBodySchema,
})
