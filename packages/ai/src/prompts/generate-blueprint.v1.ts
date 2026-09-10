/** A whole agent system from a description of the work it has to do. */
import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export interface GenerateBlueprintInput extends BasePromptInput {
  /** What the user wants the system to do, in their words. */
  brief: string
}

export const generateBlueprintV1: PromptTemplate<GenerateBlueprintInput> = {
  id: 'generate-blueprint',
  version: 1,
  system: systemPrompt({
    // Every kind this operation can produce, so each one arrives with its own rules in
    // front of it rather than being corrected afterwards.
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
    purpose: `You are designing a complete Blueprint from a description of a job to be done.

Design for the work, not for the checklist. A one-person job gets one agent; a job with a
review step gets a reviewer and a workflow that routes to it. Every artifact you create must
be used by something: a skill no agent holds and a law that scopes to nothing are worse than
absent, because they read as finished work.

Be concrete about the domain. "Follow best practices" is not an Iron Law; "No test may assert
on a mocked call that the code under test does not make" is. Verification is what separates a
specification from a wish, so every workflow ends in something checkable.`,
    contract: `- Produce agents, skills, workflows, iron laws, rules, gates, hooks, tools, memory and
  requirements as the work needs them. Omit a kind entirely rather than padding it.
- Name one primary agent. It is the one whose persona becomes the root instruction file.
- Wire the references: an agent lists the ids of the skills, laws, rules and tools it uses,
  and a workflow step that names an agent uses that agent's id.
- Every workflow has a start step, an end step, and connections that reach the end.
- Bodies are Markdown, written to be read by the agent that will run under them.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      `Design a Blueprint for this:\n\n${input.brief.trim()}\n\nProduce the artifacts the work needs and nothing more.`,
    ),
}
