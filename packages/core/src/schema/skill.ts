import { z } from 'zod'

import {
  agentRoleSchema,
  entityBaseSchema,
  markdownBodySchema,
  relativePathSchema,
  slugListSchema,
  stringListSchema,
} from './common'

/** Agent Skills specification limit for `description`. */
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024

/**
 * When a skill becomes active. Every list is a disjunction within itself; lists are
 * combined with OR as well ("active when any condition matches"). Adapters translate what
 * they can (Claude `paths:`, Copilot `applyTo`) and fold the rest into `when_to_use` text.
 */
export const skillActivationSchema = z.object({
  filePatterns: stringListSchema,
  fileTypes: stringListSchema,
  directories: stringListSchema,
  intents: stringListSchema,
  agentRoles: z.array(agentRoleSchema).default([]),
  workflowIds: slugListSchema,
})

export const SKILL_RESOURCE_KINDS = ['reference', 'script', 'asset'] as const

export const SKILL_RESOURCE_ENCODINGS = ['utf8', 'base64'] as const

/**
 * A file that ships alongside SKILL.md (references/, scripts/, assets/).
 *
 * `content` is the file itself for text and base64 for anything else, because the model has to
 * stay JSON-serializable: it travels through ChangeSets, undo history and IndexedDB. The bytes
 * on disk are the real bytes either way — only this representation is encoded.
 */
export const skillResourceSchema = z.object({
  path: relativePathSchema,
  kind: z.enum(SKILL_RESOURCE_KINDS),
  encoding: z.enum(SKILL_RESOURCE_ENCODINGS).default('utf8'),
  content: z.string(),
})

/**
 * How a person reaches the skill, as opposed to when the model loads it (`activation`).
 * A knowledge skill the model applies on its own has no business in the command menu;
 * a skill that takes an argument should say what.
 */
export const skillInvocationSchema = z.object({
  /** Listed as a command a person can run. Off for skills only the model should pick. */
  userInvocable: z.boolean().default(true),
  /** What to type after the command, e.g. `[file or directory]`. */
  argumentHint: z.string().optional(),
})

export const skillSchema = entityBaseSchema.extend({
  whenToUse: z.string().optional(),
  activation: skillActivationSchema.prefault({}),
  invocation: skillInvocationSchema.prefault({}),
  referenceIds: slugListSchema,
  allowedToolIds: slugListSchema,
  resources: z.array(skillResourceSchema).default([]),
  /** SKILL.md body: purpose, instructions, constraints, examples, verification. */
  body: markdownBodySchema,
})
