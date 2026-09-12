import { z } from 'zod'

import {
  entityBaseSchema,
  governanceCategorySchema,
  markdownBodySchema,
  scopeSchema,
  severitySchema,
  stringListSchema,
  toolKindSchema,
} from './common'

// ---------------------------------------------------------------------------
// Iron Laws — non-negotiable constraints.
// ---------------------------------------------------------------------------

export const IRON_LAW_SEVERITIES = ['critical', 'high', 'medium'] as const
export const ENFORCEMENT_MECHANISMS = ['instruction', 'hook', 'gate'] as const

export const ironLawSchema = entityBaseSchema.extend({
  /** The law itself, one or two imperative sentences. */
  rule: z.string().min(1),
  rationale: z.string().optional(),
  examples: stringListSchema,
  counterexamples: stringListSchema,
  /** What the agent must do when the law cannot be honoured (e.g. state it explicitly). */
  violationBehavior: z.string().optional(),
  severity: z.enum(IRON_LAW_SEVERITIES).default('high'),
  category: governanceCategorySchema,
  scope: scopeSchema.prefault({}),
  /** How the law is enforced in compiled output; adapters use what the harness supports. */
  enforcement: z.array(z.enum(ENFORCEMENT_MECHANISMS)).default(['instruction']),
  body: markdownBodySchema,
})

// ---------------------------------------------------------------------------
// Rules — preferred behaviour (may be traded off, unlike Iron Laws).
// ---------------------------------------------------------------------------

export const RULE_PRIORITIES = ['high', 'normal', 'low'] as const

export const ruleSchema = entityBaseSchema.extend({
  guidance: z.string().min(1),
  category: governanceCategorySchema.default('general'),
  priority: z.enum(RULE_PRIORITIES).default('normal'),
  /** Globs limiting the rule to matching files; compiles to path-scoped rules where supported. */
  paths: stringListSchema,
  scope: scopeSchema.prefault({}),
  body: markdownBodySchema,
})

// ---------------------------------------------------------------------------
// Hooks — automatic actions bound to harness lifecycle events.
// ---------------------------------------------------------------------------

export const HOOK_TRIGGERS = [
  'session-start',
  'user-prompt',
  'before-tool',
  'after-tool',
  'after-file-change',
  'before-stop',
  'subagent-stop',
  'after-tool-failure',
  'subagent-start',
  'before-compact',
  'after-compact',
] as const

export const HOOK_ACTION_TYPES = [
  'command',
  'prompt-check',
  'run-tests',
  'format',
  'lint',
  'secret-scan',
  'check-iron-laws',
] as const

export const HOOK_FAILURE_BEHAVIORS = ['block', 'warn', 'return-to-agent'] as const

export const hookConditionsSchema = z.object({
  toolKinds: z.array(toolKindSchema).default([]),
  filePatterns: stringListSchema,
})

export const hookActionSchema = z.object({
  type: z.enum(HOOK_ACTION_TYPES),
  /** Shell command for `command`, `run-tests`, `format`, `lint`, `secret-scan`. */
  command: z.string().optional(),
  /** Natural-language check for `prompt-check` / `check-iron-laws`. */
  prompt: z.string().optional(),
  /**
   * A shell script shipped beside the compiled hooks and run in place of `command`, for a
   * check too long for one line: a scan of what an edit introduced, a gate with several
   * steps. POSIX shell; written as `<id>.sh` where each harness keeps hook scripts.
   */
  script: z.string().optional(),
  timeoutSec: z.number().int().min(1).max(3600).optional(),
  /**
   * Run in the background and never block: for logging, telemetry and slow checks whose
   * result nobody waits for. A background hook's failure cannot refuse anything.
   */
  async: z.boolean().default(false),
})

export const hookSchema = entityBaseSchema.extend({
  trigger: z.enum(HOOK_TRIGGERS),
  conditions: hookConditionsSchema.prefault({}),
  action: hookActionSchema,
  onSuccess: z.literal('continue').default('continue'),
  onFailure: z.enum(HOOK_FAILURE_BEHAVIORS).default('block'),
  severity: severitySchema.default('high'),
})

// ---------------------------------------------------------------------------
// Gates — checkpoints that decide whether a workflow may continue.
// ---------------------------------------------------------------------------

export const GATE_CRITERION_KINDS = [
  'tests-pass',
  'command',
  'lint',
  'security-scan',
  'requirements-check',
  'review',
  'human-approval',
  'custom',
] as const

export const GATE_FAILURE_BEHAVIORS = ['allow', 'warn', 'block', 'request-approval'] as const

export const gateCriterionSchema = z.object({
  kind: z.enum(GATE_CRITERION_KINDS),
  description: z.string().optional(),
  /** Executable check when the criterion can be automated. */
  command: z.string().optional(),
})

export const gateSchema = entityBaseSchema.extend({
  criteria: z.array(gateCriterionSchema).default([]),
  onFail: z.enum(GATE_FAILURE_BEHAVIORS).default('block'),
})
