/**
 * A better version of an artifact that already exists.
 *
 * The id and the kind are the caller's, not the model's. That is enforced twice: the prompt
 * says so, and the answer's id is overwritten with the selected one before it is assembled.
 * A model that renames an artifact while improving it would otherwise produce a create op
 * beside an untouched original, which reads as a duplicate rather than as an edit.
 */
import { AIError } from '../client/errors'
import { improveArtifactV1, type QuickAction } from '../prompts/improve-artifact.v1'
import { artifactOutputSchema } from '../schemas/outputs'
import { assembleChangeSet } from './assemble'
import { ask, contextFor } from './run'
import type { ChangeSetResult, OperationContext, OperationDeps } from './types'

export interface ImproveArtifactOptions {
  action?: QuickAction
}

export async function improveArtifact(
  deps: OperationDeps,
  ctx: OperationContext,
  options: ImproveArtifactOptions = {},
): Promise<ChangeSetResult> {
  const selection = ctx.selection
  if (!selection) {
    throw new AIError('bad-request', 'Nothing is selected to improve.')
  }

  const context = contextFor(ctx, deps, improveArtifactV1.system)
  const answer = await ask(
    deps,
    improveArtifactV1,
    {
      kind: selection.kind,
      id: selection.id,
      ...(options.action !== undefined ? { action: options.action } : {}),
      ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
    },
    artifactOutputSchema(selection.kind),
    context,
  )

  const { changeSet, notes } = assembleChangeSet({
    blueprint: ctx.blueprint,
    source: 'ai',
    id: `ai:${improveArtifactV1.id}:${selection.kind}:${selection.id}`,
    summary: `${options.action ?? 'Improve'} ${selection.kind} "${selection.id}"`,
    drafts: [
      {
        kind: selection.kind,
        // The model may not move the artifact; the selection decides what is being edited.
        value: { ...answer.value.artifact, id: selection.id },
        ...(answer.value.note !== undefined ? { note: answer.value.note } : {}),
      },
    ],
  })

  if (changeSet.ops.length === 0) {
    notes.push('The model returned the artifact unchanged.')
  }
  return { changeSet, notes, contextTrimmed: context.trimmed }
}
