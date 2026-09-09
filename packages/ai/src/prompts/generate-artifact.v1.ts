/** One new artifact of a named kind, to sit in a Blueprint that already exists. */
import type { EntityKind } from '@agent-blueprint/core'

import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export interface GenerateArtifactInput extends BasePromptInput {
  kind: EntityKind
  brief: string
}

export const generateArtifactV1: PromptTemplate<GenerateArtifactInput> = {
  id: 'generate-artifact',
  version: 1,
  system: systemPrompt({
    purpose: `You are writing one new artifact for a Blueprint that already exists.

It has to fit what is already there. Match the vocabulary the existing artifacts use, reuse
the ids you can see rather than proposing near-duplicates, and do not restate what a
neighbouring artifact already says — the compiler puts them in the same file, and the agent
reading it will see the repetition.

If the Blueprint already has something that does this job, say so in the description rather
than writing a second copy of it under a new name.`,
    contract: `- Produce exactly one artifact, of the kind asked for and no other.
- Its id must not collide with an existing id of that kind.
- References must be to ids present in the context.
- The body is Markdown and is the substance; the fields are how it is found and enforced.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      `Write one new artifact of kind "${input.kind}" for this Blueprint:\n\n${input.brief.trim()}`,
    ),
}
