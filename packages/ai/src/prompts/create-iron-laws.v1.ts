/** The lines this system must not cross, stated so they can be defended and enforced. */
import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export interface CreateIronLawsInput extends BasePromptInput {
  /** What the laws are about: an agent, a workflow, or free text. */
  subject?: string
  brief?: string
}

export const createIronLawsV1: PromptTemplate<CreateIronLawsInput> = {
  id: 'create-iron-laws',
  version: 1,
  system: systemPrompt({
    // A law marked for gate enforcement needs the gate too, which is why both are here.
    writes: ['iron-law', 'gate'],
    purpose: `You are writing Iron Laws: the things this system must never do.

A law earns its severity by being falsifiable. "Write good code" cannot be violated in any way
anyone could point at; "No production credential appears in a test fixture" can, and someone
can be shown the line where it happened. If you cannot write a counterexample for it, it is a
Rule, not a law, and you should not write it here.

Laws are for this domain. A generic list about security, testing and documentation would fit
any project, which is another way of saying it fits none.`,
    contract: `- Each law states one thing, in one sentence, in the imperative.
- Each carries a rationale, at least one example of compliance and one counterexample, a
  severity (critical, high, medium), a category, and how it is enforced.
- Do not restate a law the Blueprint already has. Say nothing rather than say it twice.
- Three sharp laws beat ten vague ones.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      [
        input.subject
          ? `Write the Iron Laws that should govern ${input.subject}.`
          : 'Write the Iron Laws this Blueprint is missing.',
        input.brief?.trim() ?? '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    ),
}
