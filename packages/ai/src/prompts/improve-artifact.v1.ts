/**
 * A better version of an artifact that exists.
 *
 * The quick actions are the whole point of this template: a fragment per action, composed onto
 * one prompt, so that "add edge cases" and "simplify" are the same operation with a different
 * sentence rather than eight prompts to keep in step with each other.
 */
import type { EntityKind } from '@agent-blueprint/core'

import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export const QUICK_ACTIONS = [
  'improve',
  'rewrite',
  'more-specific',
  'add-examples',
  'add-edge-cases',
  'add-verification',
  'simplify',
  'make-portable',
] as const

export type QuickAction = (typeof QUICK_ACTIONS)[number]

export const QUICK_ACTION_LABELS: Record<QuickAction, string> = {
  improve: 'Improve',
  rewrite: 'Rewrite',
  'more-specific': 'Make more specific',
  'add-examples': 'Add examples',
  'add-edge-cases': 'Add edge cases',
  'add-verification': 'Add verification',
  simplify: 'Simplify',
  'make-portable': 'Make portable',
}

/** What each action asks for, appended to the request. One sentence each, on purpose. */
export const QUICK_ACTION_INSTRUCTIONS: Record<QuickAction, string> = {
  improve:
    'Improve it where it is weakest. Keep what already works; do not rewrite for the sake of it.',
  rewrite: 'Rewrite it from scratch for the same purpose, keeping its id, name and references.',
  'more-specific':
    'Replace every general statement with a specific one: name the commands, files, tools and thresholds it actually means.',
  'add-examples':
    'Add concrete examples, and where the kind supports them, counterexamples that would be mistaken for the right thing.',
  'add-edge-cases':
    'Cover what happens when the ordinary path does not hold: empty input, failure, partial results, conflicting instructions.',
  'add-verification':
    'Say how anyone would know this was done correctly — the command to run, the output to expect, the check that fails loudly.',
  simplify:
    'Cut it down. Remove repetition, filler and anything another artifact already says, without losing a requirement.',
  'make-portable':
    'Remove anything specific to one harness or one machine, so every compile target can carry it.',
}

export interface ImproveArtifactInput extends BasePromptInput {
  kind: EntityKind
  id: string
  action?: QuickAction
}

export const improveArtifactV1: PromptTemplate<ImproveArtifactInput> = {
  id: 'improve-artifact',
  version: 1,
  system: systemPrompt({
    purpose: `You are revising one artifact of a Blueprint that already exists.

You are editing, not replacing. The artifact has dependents that name it by id and rely on
what it promises; changing what it is about breaks them silently. Change the wording, the
detail and the substance of the body freely — but if you find yourself writing a different
artifact, the right answer is a smaller change.

Anything already said by a neighbouring artifact in the context does not need repeating here.`,
    contract: `- Return the complete revised artifact, not a patch and not only the changed fields.
- Keep the id and the kind exactly as given; they are not yours to change.
- Keep every reference that still makes sense, and drop only those the revision makes wrong.
- If the artifact is already good for what was asked, return it unchanged rather than padding it.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      [
        `Revise the ${input.kind} "${input.id}".`,
        input.action ? QUICK_ACTION_INSTRUCTIONS[input.action] : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
}
