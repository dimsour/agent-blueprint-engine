/**
 * A whole agent system from a sentence about the work.
 *
 * This is the operation behind "draft with AI" in the wizard, and the one where the assembler
 * earns its keep: a model designing twelve artifacts at once will refer to ids it renamed
 * halfway through, invent one that collides with something already there, and occasionally
 * hand back a workflow whose steps point at an agent it decided not to write. All of that is
 * resolved or removed before the user sees a diff.
 *
 * What the assembler cannot resolve is an artifact that parses and is incomplete — a skill
 * with no instructions in it, a law marked for a gate that was never written, a loop with no
 * way out. Reported from use: a draft arrived with nineteen such findings (P9-14). The house
 * style now says all of it up front, and the draft is checked against both passes afterwards;
 * whatever the model still left is read back to it once, in the validator's own words.
 */
import {
  type BLUEPRINT_COLLECTION_KEYS,
  type EntityKind,
  kindForCollection,
} from '@agent-blueprint/core'

import { generateBlueprintV1 } from '../prompts/generate-blueprint.v1'
import { generateBlueprintOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Assembly, type Draft } from './assemble'
import { complaintsFor, findingsIntroduced } from './check'
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

  const attempt = async (instruction: string | undefined): Promise<Assembly> => {
    const answer = await ask(
      deps,
      generateBlueprintV1,
      { brief, ...(instruction !== undefined ? { instruction } : {}) },
      generateBlueprintOutputSchema,
      context,
    )
    return assemble(ctx, answer.value)
  }

  const first = await attempt(ctx.instruction)
  const problems = findingsIntroduced(ctx.blueprint, first.changeSet)
  const complaints = complaintsFor(problems)
  if (complaints.length === 0) {
    return { changeSet: first.changeSet, notes: first.notes, contextTrimmed: context.trimmed }
  }

  // One more attempt, not a loop. A model that cannot write a complete skill when shown the
  // rule it broke will not manage it on the fifth try, and a whole Blueprint is a long wait.
  const second = await attempt(
    [
      ctx.instruction ?? '',
      'A previous attempt produced a Blueprint with these problems. Design it again, keeping what was right and fixing every one of these:',
      ...complaints,
    ]
      .filter(Boolean)
      .join('\n'),
  )
  const remaining = complaintsFor(findingsIntroduced(ctx.blueprint, second.changeSet))

  // Kept only if it is actually better. A second draft with more wrong with it than the first
  // is not an improvement, and the user would have no way to know.
  const better = remaining.length < complaints.length ? second : first
  const left = better === second ? remaining : complaints
  const notes = [...better.notes]
  if (left.length > 0) {
    notes.push(
      `${left.length} ${left.length === 1 ? 'finding' : 'findings'} remain in this draft; the health bar lists them once it is applied.`,
    )
  }
  return { changeSet: better.changeSet, notes, contextTrimmed: context.trimmed }
}

function assemble(
  ctx: OperationContext,
  answer: {
    name: string
    description?: string | undefined
    primaryAgentId?: string | undefined
  } & Record<string, unknown>,
): Assembly {
  const drafts: Draft[] = []
  for (const collection of DRAFT_ORDER) {
    const kind: EntityKind = kindForCollection(collection)
    for (const value of answer[collection] as unknown[]) drafts.push({ kind, value })
  }

  return assembleChangeSet({
    blueprint: ctx.blueprint,
    source: 'ai',
    id: `ai:${generateBlueprintV1.id}`,
    summary: `Draft "${answer.name}": ${drafts.length} artifacts`,
    drafts,
    header: {
      name: answer.name,
      ...(answer.description !== undefined ? { description: answer.description } : {}),
      ...(answer.primaryAgentId !== undefined
        ? {
            settings: { ...ctx.blueprint.settings, primaryAgentId: answer.primaryAgentId },
          }
        : {}),
    },
  })
}
