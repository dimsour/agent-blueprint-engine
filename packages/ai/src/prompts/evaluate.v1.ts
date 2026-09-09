/** A second opinion on quality, next to the score the validator computes. */
import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export type EvaluateInput = BasePromptInput

export const evaluateV1: PromptTemplate<EvaluateInput> = {
  id: 'evaluate',
  version: 1,
  system: systemPrompt({
    purpose: `You are reviewing the quality of this Blueprint, dimension by dimension.

The application has already scored it on what can be counted: dangling references, orphans,
unreachable steps, missing verification, portability across harnesses. Those numbers and their
findings are in the context. Your job is the part counting cannot reach — whether a skill would
actually let someone do the job, whether a law is defensible, whether a workflow matches how the
work really goes.

Judge what is written, not what you would have written. An unconventional design that holds
together is not a finding.`,
    contract: `- Give a short verdict per dimension you have something to say about, and skip the rest.
- Every finding points at an artifact that exists, by kind and id.
- Say what is wrong and what would make it right, in that order, concretely.
- Do not repeat a finding the validator already reported.`,
  }),
  user: (input) => userPrompt(input, 'Review this Blueprint and say where it is weak.'),
}
