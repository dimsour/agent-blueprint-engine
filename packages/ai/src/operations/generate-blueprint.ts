/**
 * A whole agent system from a sentence about the work.
 *
 * This is the operation behind "draft with AI" in the wizard, and the one where the assembler
 * earns its keep: a model designing twelve artifacts at once will refer to ids it renamed
 * halfway through, invent one that collides with something already there, and occasionally
 * hand back a workflow whose steps point at an agent it decided not to write. All of that is
 * resolved or removed before the user sees a diff.
 */
import {
  type BLUEPRINT_COLLECTION_KEYS,
  type EntityKind,
  kindForCollection,
} from '@agent-blueprint/core'

import { generateBlueprintV1 } from '../prompts/generate-blueprint.v1'
import { generateBlueprintOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Draft } from './assemble'
import { ask, contextFor } from './run'
import type { ChangeSetResult, OperationContext, OperationDeps } from './types'

/** The order artifacts are created in: what others point at comes first. */
const DRAFT_ORDER = [
  'tools',
  'references',
  'memories',
  'skills',
  'gates',
  'hooks',
  'ironLaws',
  'rules',
  'agents',
  'workflows',
  'requirements',
] as const satisfies readonly (typeof BLUEPRINT_COLLECTION_KEYS)[number][]

export async function generateBlueprint(
  deps: OperationDeps,
  ctx: OperationContext,
  brief: string,
): Promise<ChangeSetResult> {
  const context = contextFor(ctx, deps, generateBlueprintV1.system)
  const answer = await ask(
    deps,
    generateBlueprintV1,
    { brief, ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}) },
    generateBlueprintOutputSchema,
    context,
  )

  const drafts: Draft[] = []
  for (const collection of DRAFT_ORDER) {
    const kind: EntityKind = kindForCollection(collection)
    for (const value of answer.value[collection]) drafts.push({ kind, value })
  }

  const { changeSet, notes } = assembleChangeSet({
    blueprint: ctx.blueprint,
    source: 'ai',
    id: `ai:${generateBlueprintV1.id}`,
    summary: `Draft "${answer.value.name}": ${drafts.length} artifacts`,
    drafts,
    header: {
      name: answer.value.name,
      ...(answer.value.description !== undefined ? { description: answer.value.description } : {}),
      ...(answer.value.primaryAgentId !== undefined
        ? {
            settings: {
              ...ctx.blueprint.settings,
              primaryAgentId: answer.value.primaryAgentId,
            },
          }
        : {}),
    },
  })

  return { changeSet, notes, contextTrimmed: context.trimmed }
}
