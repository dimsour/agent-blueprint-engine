/**
 * One new artifact, wired into the Blueprint it joins.
 *
 * The wiring is not asked for. A model that has just invented a skill will happily also
 * rewrite the agent that uses it, and reviewing a two-op change where the second op is an
 * agent rewrite nobody asked for is how a review gets rubber-stamped. So the model writes the
 * artifact and the assembler adds its id to the right list, which is a change the user can
 * read in a second.
 */
import type { EntityKind } from '@agent-blueprint/core'

import { generateArtifactV1 } from '../prompts/generate-artifact.v1'
import { artifactOutputSchema } from '../schemas/outputs'
import { assembleChangeSet } from './assemble'
import { ask, contextFor } from './run'
import type { ChangeSetResult, OperationContext, OperationDeps } from './types'

export interface GenerateArtifactOptions {
  kind: EntityKind
  brief: string
  /**
   * The agent to wire the artifact into. Defaults to the selected agent, then the primary
   * agent; pass `null` to wire it into nothing.
   */
  attachToAgentId?: string | null
}

export async function generateArtifact(
  deps: OperationDeps,
  ctx: OperationContext,
  options: GenerateArtifactOptions,
): Promise<ChangeSetResult> {
  const context = contextFor(ctx, deps, generateArtifactV1.system)
  const answer = await ask(
    deps,
    generateArtifactV1,
    {
      kind: options.kind,
      brief: options.brief,
      ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
    },
    artifactOutputSchema(options.kind),
    context,
  )

  const attach = resolveAttachment(ctx, options)
  const { changeSet, notes } = assembleChangeSet({
    blueprint: ctx.blueprint,
    source: 'ai',
    id: `ai:${generateArtifactV1.id}:${options.kind}`,
    summary: `New ${options.kind}`,
    drafts: [
      {
        kind: options.kind,
        value: answer.value.artifact,
        ...(answer.value.note !== undefined ? { note: answer.value.note } : {}),
      },
    ],
    ...(attach !== undefined ? { attachToAgentId: attach } : {}),
  })

  return { changeSet, notes, contextTrimmed: context.trimmed }
}

function resolveAttachment(
  ctx: OperationContext,
  options: GenerateArtifactOptions,
): string | undefined {
  if (options.attachToAgentId === null) return undefined
  if (options.attachToAgentId !== undefined) return options.attachToAgentId
  if (ctx.selection?.kind === 'agent') return ctx.selection.id
  return ctx.blueprint.settings.primaryAgentId
}
