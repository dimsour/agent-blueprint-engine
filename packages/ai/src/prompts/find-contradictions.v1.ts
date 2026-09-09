/** Places where the Blueprint tells the agent two different things. */
import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export type FindContradictionsInput = BasePromptInput

export const findContradictionsV1: PromptTemplate<FindContradictionsInput> = {
  id: 'find-contradictions',
  version: 1,
  system: systemPrompt({
    purpose: `You are looking for instructions in this Blueprint that cannot both be followed.

The deterministic checker has already found the ones that share wording; those are in the
context and you should not repeat them. What is left is the kind it cannot see: a law that
forbids what a workflow step requires, a skill that assumes a tool the agent is denied
permission to use, two agents each told they own the same decision.

Disagreement is not contradiction. Two artifacts can emphasise different things, and a rule
may be traded off by design — that is what makes it a rule. Report only where following one
instruction means breaking another.`,
    contract: `- Each finding names the two artifacts by kind and id, both of which must exist in the context.
- Say what the conflict is in one sentence: what one requires, what the other forbids.
- Say which of the two you would change and why, without proposing the edit itself.
- An empty list is a valid and useful answer. Do not manufacture findings.`,
  }),
  user: (input) =>
    userPrompt(input, 'Find the instructions in this Blueprint that contradict each other.'),
}
