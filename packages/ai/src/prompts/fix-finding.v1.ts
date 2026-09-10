/**
 * Making one finding go away.
 *
 * The prompt is assembled per finding rather than written per code, and the part that makes it
 * specific is already in the product: `DIAGNOSTIC_CODES` carries a `remedy` for every code the
 * core can emit — the instructions a person is shown when they press "How to fix" (P9-10).
 * The same sentence steers the model. That is the whole design: one template, sixty-odd
 * behaviours, and no second catalogue of prompts to keep in step with the first.
 *
 * The contract insists on the smallest change that clears the finding, because a model asked
 * to fix a missing description will otherwise rewrite the body it was not asked about, and a
 * review whose diff is mostly noise is a review nobody reads.
 */
import type { EntityKind, EntityRef } from '@agent-blueprint/core'

import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export interface FixFindingInput extends BasePromptInput {
  /** The diagnostic code, so the answer can be traced back to the rule that asked. */
  code: string
  /** What the code means in general, from the catalogue. */
  summary: string
  /** How this kind of finding is fixed, from the catalogue. The steering. */
  remedy: string
  /** What the rule said about this Blueprint, naming the artifact. */
  message: string
  /** The artifact the finding is about, when it names one. */
  ref?: EntityRef | undefined
  /** Other artifacts the finding names — the second half of a contradiction, say. */
  related?: readonly EntityRef[] | undefined
  /** The kinds this fix is allowed to write. */
  kinds: readonly EntityKind[]
}

function about(input: FixFindingInput): string {
  if (!input.ref) return 'It is about the Blueprint as a whole, not one artifact.'
  const others = (input.related ?? []).map((ref) => `${ref.kind} "${ref.id}"`)
  const first = `It is about the ${input.ref.kind} "${input.ref.id}".`
  return others.length > 0 ? `${first} It also names ${others.join(' and ')}.` : first
}

export const fixFindingV1: PromptTemplate<FixFindingInput> = {
  id: 'fix-finding',
  version: 1,
  system: systemPrompt({
    purpose: `You are clearing one specific finding raised against a Blueprint by its validator.

You are given the finding, what its code means, and how that kind of finding is fixed. Do
exactly that and nothing else. The user pressed a button next to one line in a list; they are
expecting the change that line asked for, and anything else in the diff is something they did
not ask for and have to read anyway.

Make the smallest change that would stop the rule from firing. If the fix needs an artifact
that does not exist yet, write it. If it needs an existing one changed, return that artifact
complete, with only the part the finding is about different.`,
    contract: `- Return only the artifacts the fix needs. An empty list is the right answer when the finding cannot be cleared by writing artifacts; say so in \`note\`.
- Return each changed artifact complete, not a patch, keeping its id and every reference that is still right.
- Do not rename anything. An id is how the rest of the Blueprint refers to an artifact, and renaming one here breaks those references silently.
- Do not fix anything the finding did not raise. Another rule will raise that one, with its own button.
- \`note\` says what you changed and why it clears the finding, in one or two sentences.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      [
        'Clear this finding.',
        '',
        `Code: ${input.code} — ${input.summary}`,
        `The finding: ${input.message}`,
        about(input),
        '',
        'How this kind of finding is fixed:',
        input.remedy,
        '',
        `You may write or revise artifacts of these kinds: ${input.kinds.join(', ')}.`,
      ].join('\n'),
    ),
}
