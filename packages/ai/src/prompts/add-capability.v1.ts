/**
 * One coherent capability, added to a Blueprint that already exists (P9-15).
 *
 * The gap this fills: "draft with AI" builds a whole Blueprint on the way in, and after that
 * the only way to add anything was one artifact at a time. But a capability is never one
 * artifact — "a .NET review expert" is an agent, the skills it holds, the laws it works under
 * and the workflow that runs it, and asking for those separately means the author has to do
 * the wiring the model was in a position to do.
 *
 * The difference from `generate-blueprint` is entirely about what is already there. That one
 * designs from nothing and names the project; this one is a guest in someone else's Blueprint
 * — it reuses what exists, does not restate it, and never touches the header.
 */
import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export interface AddCapabilityInput extends BasePromptInput {
  /** What the capability is, in the user's words. */
  brief: string
  /** The agent the user had selected, when they had one. */
  agentId?: string
}

export const addCapabilityV1: PromptTemplate<AddCapabilityInput> = {
  id: 'add-capability',
  version: 1,
  system: systemPrompt({
    writes: [
      'agent',
      'skill',
      'workflow',
      'iron-law',
      'rule',
      'hook',
      'gate',
      'tool',
      'reference',
      'memory',
      'requirement',
    ],
    purpose: `You are adding one coherent capability to a Blueprint that already exists.

A capability is rarely one artifact. "A .NET review expert" is an agent, the skills it holds,
the laws it works under and the workflow that runs it — write the set, wired together, not a
pile of parts for someone else to connect.

You are a guest in a Blueprint someone else designed. Read what is already there. Reuse the
ids you can see rather than proposing near-duplicates under new names; if an existing skill
already does the job, hold it from the new agent instead of writing a second copy. Do not
restate what a neighbouring artifact says — the compiler puts them in the same file and the
agent reading it will see the repetition.

Add what the capability needs and stop. A gate nobody stops at and a law scoped to nothing are
worse than absent, because they read as finished work.`,
    contract: `- Produce only the kinds the capability needs. Omit a kind entirely rather than padding it.
- Everything you create is used by something: an agent that holds it, a workflow step that runs it, or a scope that reaches it.
- References are to ids that exist in the context or that you are creating in this same answer.
- Do not change the Blueprint's name, its description or its primary agent. You are adding to it, not redesigning it.
- Do not re-create an artifact that is already in the context. If one is close but wrong, say so in \`summary\` and leave it alone; there is a separate action for revising it.
- \`summary\` is one line naming what the capability is, for the heading of the review.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      [
        `Add this capability to the Blueprint:`,
        '',
        input.brief.trim(),
        ...(input.agentId
          ? [
              '',
              `The user is looking at the agent "${input.agentId}". If this capability belongs to that agent, hold the new artifacts from it rather than creating a second agent beside it.`,
            ]
          : []),
      ].join('\n'),
    ),
}
