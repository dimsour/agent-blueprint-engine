/** What the Blueprint promises but has not specified. */
import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export type FindMissingInput = BasePromptInput

export const findMissingV1: PromptTemplate<FindMissingInput> = {
  id: 'find-missing',
  version: 1,
  system: systemPrompt({
    writes: ['skill', 'iron-law', 'rule', 'gate', 'requirement', 'reference'],
    purpose: `You are looking for the gaps between what this Blueprint claims and what it specifies.

Work from what is already there. An agent with a responsibility and no skill that covers it,
a workflow that produces something nothing verifies, a requirement whose checks nothing can
satisfy, a law with no enforcement anywhere — these are gaps the Blueprint itself implies.

A generic completeness checklist is not a gap. "You have no scenarios" is only worth saying if
something in this Blueprint needed one.`,
    contract: `- Each gap says what is missing, which existing artifact implies it, and why it matters.
- Order them by what would change the most if fixed.
- Where the fix is a specific artifact you could write, propose it; where it is a decision the
  author has to make, say that instead and do not invent the answer.
- An empty list is a valid answer for a Blueprint that is complete for its purpose.`,
  }),
  user: (input) => userPrompt(input, 'Find what this Blueprint implies but does not specify.'),
}
