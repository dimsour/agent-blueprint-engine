/** A workflow for an agent, drawn as a graph rather than described as a list. */
import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export interface CreateWorkflowInput extends BasePromptInput {
  /** The agent the workflow orchestrates, when there is one. */
  agentId?: string
  brief: string
}

export const createWorkflowV1: PromptTemplate<CreateWorkflowInput> = {
  id: 'create-workflow',
  version: 1,
  system: systemPrompt({
    purpose: `You are designing one workflow: a graph of typed steps and typed connections.

A workflow is how work is orchestrated, so the interesting parts are the ones a list of
instructions cannot express — where it branches, what happens when a step fails, which steps
run alongside each other, and where it is not allowed to continue without a check passing.

Step types: start, end, agent, skill, tool, condition, verification, review, gate,
human-approval, output, parallel, merge, retry, delegate, synthesis.
Connection kinds: sequential, parallel, conditional, fallback, retry, delegation, review,
aggregation.

A workflow with a start, five agent steps in a line and an end is a list with extra syntax.
If that is genuinely the work, say so with fewer steps rather than padding the graph.`,
    contract: `- Exactly one start step and at least one end step. Every step must be reachable from the
  start, and the end must be reachable from every branch.
- A step that names an agent, skill, tool or gate must use an id present in the context.
- Positions are laid out by the application; do not try to place steps.
- Include at least one verification or gate step unless the work genuinely cannot be checked,
  in which case say why in the workflow's body.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      [
        input.agentId
          ? `Design a workflow orchestrating the agent "${input.agentId}".`
          : 'Design a workflow for this Blueprint.',
        input.brief.trim(),
      ]
        .filter(Boolean)
        .join('\n\n'),
    ),
}
