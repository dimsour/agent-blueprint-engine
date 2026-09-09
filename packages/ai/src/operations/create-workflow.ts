/**
 * A workflow, checked against the validator before the user is shown it.
 *
 * A graph is the one thing a model gets wrong in ways the schema cannot catch: every step
 * parses, every field is the right type, and the end step is unreachable. The validator
 * already knows how to say that, so this operation applies its own proposal to a throwaway
 * Blueprint, runs the same rules the IDE runs, and hands whatever it finds back to the model
 * as the request for a second attempt. One attempt, not a loop — a model that cannot draw a
 * connected graph twice will not manage it on the fifth try, and the user is waiting.
 */
import { applyChangeSet, type Diagnostic, refKey, validateBlueprint } from '@agent-blueprint/core'

import { createWorkflowV1 } from '../prompts/create-workflow.v1'
import { createWorkflowOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Assembly } from './assemble'
import { ask, contextFor } from './run'
import type { ChangeSetResult, OperationContext, OperationDeps } from './types'

export interface CreateWorkflowOptions {
  /** The agent the workflow orchestrates, and the one it is wired into. */
  agentId?: string
  brief: string
}

export async function createWorkflowFor(
  deps: OperationDeps,
  ctx: OperationContext,
  options: CreateWorkflowOptions,
): Promise<ChangeSetResult> {
  const context = contextFor(ctx, deps, createWorkflowV1.system)
  const agentId =
    options.agentId ?? (ctx.selection?.kind === 'agent' ? ctx.selection.id : undefined)

  const attempt = async (instruction: string | undefined): Promise<Assembly> => {
    const answer = await ask(
      deps,
      createWorkflowV1,
      {
        brief: options.brief,
        ...(agentId !== undefined ? { agentId } : {}),
        ...(instruction !== undefined ? { instruction } : {}),
      },
      createWorkflowOutputSchema,
      context,
    )
    return assembleChangeSet({
      blueprint: ctx.blueprint,
      source: 'ai',
      id: `ai:${createWorkflowV1.id}`,
      summary: `New workflow "${answer.value.workflow.name}"`,
      drafts: [
        {
          kind: 'workflow',
          value: answer.value.workflow,
          ...(answer.value.note !== undefined ? { note: answer.value.note } : {}),
        },
      ],
      ...(agentId !== undefined ? { attachToAgentId: agentId } : {}),
    })
  }

  const first = await attempt(ctx.instruction)
  const problems = problemsIntroduced(ctx, first)
  if (problems.length === 0) {
    return { changeSet: first.changeSet, notes: first.notes, contextTrimmed: context.trimmed }
  }

  const second = await attempt(
    [
      ctx.instruction ?? '',
      'A previous attempt produced a workflow the validator rejected. Fix these and keep everything else:',
      ...problems.map((problem) => `- ${problem.code}: ${problem.message}`),
    ]
      .filter(Boolean)
      .join('\n'),
  )
  const remaining = problemsIntroduced(ctx, second)
  const notes = [...second.notes]
  if (remaining.length > 0) {
    notes.push(
      `The workflow still has ${remaining.length} validation ${remaining.length === 1 ? 'finding' : 'findings'}; they are shown once it is applied.`,
    )
  }
  return { changeSet: second.changeSet, notes, contextTrimmed: context.trimmed }
}

/**
 * What the validator says about the Blueprint after this proposal that it did not say
 * before. Warnings count, not only errors: the mistakes a model makes when drawing a graph
 * are mostly warnings — a step nothing reaches, a workflow that finishes without verifying
 * anything — and those are exactly the ones worth one more attempt.
 */
function problemsIntroduced(ctx: OperationContext, assembly: Assembly): Diagnostic[] {
  if (assembly.changeSet.ops.length === 0) return []
  const applied = applyChangeSet(ctx.blueprint, assembly.changeSet)
  const before = new Set(validateBlueprint(ctx.blueprint).map(fingerprint))
  return validateBlueprint(applied.blueprint).filter(
    (finding) =>
      !before.has(fingerprint(finding)) &&
      // Anything about the graph itself, plus any error at all. Not the warnings about how the
      // workflow is wired in — an orphan workflow is the caller's decision not to attach it,
      // and asking the model to draw it again would change nothing.
      (finding.severity === 'error' || finding.code.startsWith('BP-WF-')),
  )
}

function fingerprint(finding: Diagnostic): string {
  return `${finding.code}|${finding.ref ? refKey(finding.ref) : ''}|${finding.message}`
}
