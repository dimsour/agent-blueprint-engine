/**
 * The checks the validator cannot run.
 *
 * Most requirement checks are declarative queries with a yes or no answer: does a workflow
 * have a verification step, does a hook exist, does this text appear. `ai-judged` is the
 * escape hatch for the ones that are not — "the agent explains its reasoning before acting" —
 * and this is what fills them in.
 */
import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export interface JudgeRequirementsInput extends BasePromptInput {
  /** The checks to judge, each already located by requirement and index. */
  checks: { id: string; requirement: string; prompt: string }[]
}

export const judgeRequirementsV1: PromptTemplate<JudgeRequirementsInput> = {
  id: 'judge-requirements',
  version: 1,
  system: systemPrompt({
    purpose: `You are judging whether this Blueprint satisfies a claim its author made about it.

Judge the Blueprint as written, not the system it describes as you imagine it running. The
question is always whether the specification in front of you says the thing, not whether a
well-behaved agent would probably do it anyway.

"Not sure" is an answer, and a better one than a guess. A requirement marked satisfied on a
hunch is worse than one left open, because the author will stop looking at it.`,
    contract: `- One verdict per check you were given, using the id it was given under.
- \`pass\` only when something in the Blueprint actually says it. \`fail\` when nothing does.
  \`unclear\` when the Blueprint is ambiguous or the check cannot be judged from what is here.
- The rationale is one sentence and names the artifact that decided it, where one did.
- Do not judge a check you were not given.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      [
        'Judge each of these checks against the Blueprint above:',
        ...input.checks.map(
          (check) => `- ${check.id}: for the requirement "${check.requirement}" — ${check.prompt}`,
        ),
      ].join('\n'),
    ),
}
