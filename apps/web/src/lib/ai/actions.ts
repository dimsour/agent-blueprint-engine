/**
 * What the assistant can be asked to do, and when.
 *
 * One entry per operation in docs/06, with the two things the panel needs and the operations
 * do not know: what has to be selected for it to make sense, and what the user has to type.
 * Keeping that here rather than in the component means the palette, the panel and the tests
 * agree about which actions exist, and adding an operation is one entry rather than three.
 *
 * Availability is stated as a reason, not a boolean. An action that is simply missing teaches
 * nothing; "select an agent first" teaches what to do next, which is the rule the command
 * palette already follows.
 */
import type { Blueprint, ChangeSet, Diagnostic, EntityKind, EntityRef } from '@agent-blueprint/core'
import {
  compound,
  createIronLawsFor,
  createWorkflowFor,
  evaluate,
  findContradictions,
  findMissing,
  generateArtifact,
  generateBlueprint,
  improveArtifact,
  QUICK_ACTION_LABELS,
  QUICK_ACTIONS,
  type AIEvaluationReport,
  type OperationContext,
  type OperationDeps,
  type QuickAction,
} from '@agent-blueprint/ai'

export type AssistantResult =
  | { kind: 'changeset'; changeSet: ChangeSet; notes: string[]; contextTrimmed: boolean }
  | {
      kind: 'diagnostics'
      diagnostics: Diagnostic[]
      /** Artifacts proposed alongside the findings, when the operation offers any. */
      proposals?: ChangeSet
      notes: string[]
      contextTrimmed: boolean
    }
  | { kind: 'report'; report: AIEvaluationReport; notes: string[]; contextTrimmed: boolean }

export interface AssistantInput {
  /** Free text the user typed. */
  text: string
  /** For "New artifact", the kind chosen. */
  kind: EntityKind
}

export interface AssistantAction {
  id: string
  label: string
  hint: string
  group: 'This artifact' | 'The Blueprint' | 'Review'
  /** What the free-text field is for, when the action uses one. */
  field?: { label: string; placeholder: string; required: boolean; rows: number }
  /** Whether the action picks an artifact kind. */
  picksKind?: boolean
  /** Why this cannot run right now, or undefined when it can. */
  unavailable(blueprint: Blueprint, selection: EntityRef | undefined): string | undefined
  run(deps: OperationDeps, ctx: OperationContext, input: AssistantInput): Promise<AssistantResult>
}

const needsSelection = (_: Blueprint, selection: EntityRef | undefined) =>
  selection ? undefined : 'Select an artifact first'

const needsAgent = (blueprint: Blueprint, selection: EntityRef | undefined) => {
  if (selection?.kind === 'agent') return undefined
  return blueprint.agents.length > 0 ? 'Select an agent first' : 'This Blueprint has no agents'
}

const always = () => undefined

function changes(result: {
  changeSet: ChangeSet
  notes: string[]
  contextTrimmed: boolean
}): AssistantResult {
  return { kind: 'changeset', ...result }
}

/** The eight quick actions, each one entry, composed onto the same operation. */
const quickActions: AssistantAction[] = QUICK_ACTIONS.map((action: QuickAction) => ({
  id: `improve:${action}`,
  label: QUICK_ACTION_LABELS[action],
  hint: 'Rewrites the selected artifact.',
  group: 'This artifact',
  field: {
    label: 'Anything else it should know',
    placeholder: 'Optional.',
    required: false,
    rows: 2,
  },
  unavailable: needsSelection,
  run: async (deps, ctx, input) =>
    changes(
      await improveArtifact(deps, input.text ? { ...ctx, instruction: input.text } : ctx, {
        action,
      }),
    ),
}))

export const ASSISTANT_ACTIONS: AssistantAction[] = [
  ...quickActions,
  {
    id: 'create-iron-laws',
    label: 'Iron Laws for this',
    hint: 'The lines this must not cross, with rationale and counterexamples.',
    group: 'This artifact',
    field: { label: 'What they should cover', placeholder: 'Optional.', required: false, rows: 2 },
    unavailable: needsSelection,
    run: async (deps, ctx, input) =>
      changes(await createIronLawsFor(deps, ctx, input.text ? { brief: input.text } : {})),
  },
  {
    id: 'create-workflow',
    label: 'A workflow for this agent',
    hint: 'A graph with branches, checks and a way out.',
    group: 'This artifact',
    field: {
      label: 'What the workflow is for',
      placeholder: 'Reviewing a pull request end to end.',
      required: true,
      rows: 2,
    },
    unavailable: needsAgent,
    run: async (deps, ctx, input) =>
      changes(await createWorkflowFor(deps, ctx, { brief: input.text })),
  },
  {
    id: 'generate-blueprint',
    label: 'Draft the whole Blueprint',
    hint: 'Agents, skills, workflows and laws from a description of the work.',
    group: 'The Blueprint',
    field: {
      label: 'What the system has to do',
      placeholder:
        'A crew that reviews pull requests in a .NET codebase and blocks unverified merges.',
      required: true,
      rows: 4,
    },
    unavailable: always,
    run: async (deps, ctx, input) => changes(await generateBlueprint(deps, ctx, input.text)),
  },
  {
    id: 'generate-artifact',
    label: 'New artifact',
    hint: 'One artifact of a kind you choose, wired into the agent that will use it.',
    group: 'The Blueprint',
    picksKind: true,
    field: {
      label: 'What it is for',
      placeholder: 'Property-based testing with FsCheck.',
      required: true,
      rows: 2,
    },
    unavailable: always,
    run: async (deps, ctx, input) =>
      changes(await generateArtifact(deps, ctx, { kind: input.kind, brief: input.text })),
  },
  {
    id: 'compound',
    label: 'Turn this into reusable knowledge',
    hint: 'Notes, a transcript or a diff in; skills, laws and references out.',
    group: 'The Blueprint',
    field: {
      label: 'What happened',
      placeholder: 'Paste session notes, a transcript excerpt or a diff.',
      required: true,
      rows: 8,
    },
    unavailable: always,
    run: async (deps, ctx, input) => changes(await compound(deps, ctx, input.text)),
  },
  {
    id: 'find-contradictions',
    label: 'Find contradictions',
    hint: 'Instructions that cannot both be followed.',
    group: 'Review',
    unavailable: always,
    run: async (deps, ctx) => ({ kind: 'diagnostics', ...(await findContradictions(deps, ctx)) }),
  },
  {
    id: 'find-missing',
    label: 'Find what is missing',
    hint: 'What the Blueprint implies but does not specify.',
    group: 'Review',
    unavailable: always,
    run: async (deps, ctx) => {
      const result = await findMissing(deps, ctx)
      return {
        kind: 'diagnostics',
        diagnostics: result.diagnostics,
        notes: result.notes,
        contextTrimmed: result.contextTrimmed,
        ...(result.proposals.changeSet.ops.length > 0
          ? { proposals: result.proposals.changeSet }
          : {}),
      }
    },
  },
  {
    id: 'evaluate',
    label: 'Review the quality',
    hint: 'A second opinion beside the score the validator computes.',
    group: 'Review',
    unavailable: always,
    run: async (deps, ctx) => ({ kind: 'report', ...(await evaluate(deps, ctx)) }),
  },
]

export const ASSISTANT_GROUPS = ['This artifact', 'The Blueprint', 'Review'] as const
