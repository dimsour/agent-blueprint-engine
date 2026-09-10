/**
 * A coherent set of artifacts, added to a Blueprint that already exists (P9-15).
 *
 * Reported from use: the wizard can draft a whole Blueprint, and after that the assistant
 * could only write one artifact at a time. "Create a .NET review expert" is not one artifact —
 * it is an agent, its skills, the laws it works under and a workflow — and asking for those
 * one at a time leaves the author doing the wiring the model was in a position to do.
 *
 * The difference from `generateBlueprint` is what it is not allowed to touch. That one names
 * the project and picks its primary agent; this one adds to a Blueprint someone else designed
 * and leaves the header exactly as it found it. Everything else is shared: the same house
 * style (P9-14), the same assembler, and the same check against both validation passes with
 * one round to fix what it left.
 */
import {
  type BLUEPRINT_COLLECTION_KEYS,
  type EntityKind,
  kindForCollection,
} from '@agent-blueprint/core'

import { addCapabilityV1 } from '../prompts/add-capability.v1'
import { addCapabilityOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Assembly, type Draft } from './assemble'
import { complaintsFor, findingsIntroduced } from './check'
import { ask, contextFor } from './run'
import type { ChangeSetResult, OperationContext, OperationDeps } from './types'

/** What others point at comes first, so a reference resolves to something already drafted. */
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

export interface AddCapabilityOptions {
  /** What the capability is, in the user's words. */
  brief: string
  /** An agent to hold what is created, when the user had one selected. */
  attachToAgentId?: string
}

export async function addCapability(
  deps: OperationDeps,
  ctx: OperationContext,
  options: AddCapabilityOptions,
): Promise<ChangeSetResult> {
  const context = contextFor(ctx, deps, addCapabilityV1.system)
  const agentId =
    options.attachToAgentId ?? (ctx.selection?.kind === 'agent' ? ctx.selection.id : undefined)

  const attempt = async (instruction: string | undefined): Promise<Assembly> => {
    const answer = await ask(
      deps,
      addCapabilityV1,
      {
        brief: options.brief,
        ...(agentId !== undefined ? { agentId } : {}),
        ...(instruction !== undefined ? { instruction } : {}),
      },
      addCapabilityOutputSchema,
      context,
    )

    const drafts: Draft[] = []
    for (const collection of DRAFT_ORDER) {
      const kind: EntityKind = kindForCollection(collection)
      for (const value of answer.value[collection]) drafts.push({ kind, value })
    }

    return assembleChangeSet({
      blueprint: ctx.blueprint,
      source: 'ai',
      id: `ai:${addCapabilityV1.id}`,
      summary: answer.value.summary,
      drafts,
      // Only when the model did not write an agent of its own. It attaches what was created
      // to the selected agent, and doing that as well as wiring a new agent would hold every
      // new skill from two agents at once — which is not what "add a reviewer" means.
      ...(agentId !== undefined && answer.value.agents.length === 0
        ? { attachToAgentId: agentId }
        : {}),
    })
  }

  const first = await attempt(ctx.instruction)
  const complaints = complaintsFor(findingsIntroduced(ctx.blueprint, first.changeSet))
  if (complaints.length === 0) {
    return { changeSet: first.changeSet, notes: first.notes, contextTrimmed: context.trimmed }
  }

  // One more attempt, not a loop, and only over what this proposal introduced — the findings
  // the Blueprint already had are not the model's to answer for.
  const second = await attempt(
    [
      ctx.instruction ?? '',
      'A previous attempt added artifacts with these problems. Write the capability again, keeping what was right and fixing every one of these:',
      ...complaints,
    ]
      .filter(Boolean)
      .join('\n'),
  )
  const remaining = complaintsFor(findingsIntroduced(ctx.blueprint, second.changeSet))

  const better = remaining.length < complaints.length ? second : first
  const left = better === second ? remaining : complaints
  const notes = [...better.notes]
  if (left.length > 0) {
    notes.push(
      `${left.length} ${left.length === 1 ? 'finding' : 'findings'} remain in what this adds; the health bar lists them once it is applied.`,
    )
  }
  return { changeSet: better.changeSet, notes, contextTrimmed: context.trimmed }
}
