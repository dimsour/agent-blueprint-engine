/**
 * Experience in, reusable knowledge out.
 *
 * The user pastes what happened — notes, a transcript, a diff — and gets back a ChangeSet.
 * The source is `compound` rather than `ai` so the review, the history and anything that
 * looks at where a change came from can tell the difference between "a model suggested this"
 * and "this is what we learned last week".
 *
 * Every op keeps the note the model attached, because that note is the evidence. A proposal
 * with nothing behind it is exactly the thing this operation must not add to a Blueprint.
 */
import { compoundV1 } from '../prompts/compound.v1'
import { compoundOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Draft } from './assemble'
import { ask, contextFor } from './run'
import type { ChangeSetResult, OperationContext, OperationDeps } from './types'

export async function compound(
  deps: OperationDeps,
  ctx: OperationContext,
  notes: string,
): Promise<ChangeSetResult> {
  const context = contextFor(ctx, deps, compoundV1.system)
  const answer = await ask(
    deps,
    compoundV1,
    { notes, ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}) },
    compoundOutputSchema,
    context,
  )

  const drafts: Draft[] = answer.value.proposals.map((proposal) => ({
    kind: proposal.kind,
    value: proposal.artifact,
    ...(proposal.note !== undefined ? { note: proposal.note } : {}),
  }))

  const assembled = assembleChangeSet({
    blueprint: ctx.blueprint,
    source: 'compound',
    id: `compound:${compoundV1.id}`,
    summary: answer.value.summary,
    drafts,
  })

  const missing = assembled.changeSet.ops.filter((op) => op.note === undefined).length
  if (missing > 0) {
    assembled.notes.push(
      `${missing} ${missing === 1 ? 'proposal has' : 'proposals have'} no evidence attached.`,
    )
  }

  return {
    changeSet: assembled.changeSet,
    notes: assembled.notes,
    contextTrimmed: context.trimmed,
  }
}
