/**
 * The lines this system must not cross.
 *
 * Duplicates are the failure mode here. Ask twice and a model produces "Never commit secrets"
 * and "Secrets must never be committed", which are one law and two files, and the second one
 * makes the first look negotiable. So a proposed law whose statement means the same as one
 * already in the Blueprint is dropped with a note rather than shown as a new artifact — the
 * comparison uses the same keyword overlap the contradiction checker uses, so "near enough"
 * means the same thing here as it does everywhere else in the product.
 */
import { jaccard, keywords } from '@agent-blueprint/core'

import { createIronLawsV1 } from '../prompts/create-iron-laws.v1'
import { createIronLawsOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Draft } from './assemble'
import { ask, contextFor } from './run'
import type { ChangeSetResult, OperationContext, OperationDeps } from './types'

/** Above this overlap of significant words, two statements are the same law twice. */
export const DUPLICATE_LAW_SIMILARITY = 0.6

export interface CreateIronLawsOptions {
  /** What the laws are about: "the reviewer agent", "the release workflow". */
  subject?: string
  brief?: string
  attachToAgentId?: string | null
}

export async function createIronLawsFor(
  deps: OperationDeps,
  ctx: OperationContext,
  options: CreateIronLawsOptions = {},
): Promise<ChangeSetResult> {
  const context = contextFor(ctx, deps, createIronLawsV1.system)
  const subject = options.subject ?? describeSelection(ctx)
  const answer = await ask(
    deps,
    createIronLawsV1,
    {
      ...(subject !== undefined ? { subject } : {}),
      ...(options.brief !== undefined ? { brief: options.brief } : {}),
      ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
    },
    createIronLawsOutputSchema,
    context,
  )

  const existing = ctx.blueprint.ironLaws.map((law) => ({
    id: law.id,
    words: keywords(law.rule),
  }))
  const drafts: Draft[] = []
  const duplicates: string[] = []
  for (const law of answer.value.ironLaws) {
    // A law that did not parse has no statement to compare against; it goes through, and the
    // assembler drops it with the reason.
    const statement = read(law, 'rule')
    const words = keywords(statement)
    const match = statement
      ? existing.find((other) => jaccard(words, other.words) >= DUPLICATE_LAW_SIMILARITY)
      : undefined
    if (match) {
      duplicates.push(`"${statement}" says what ${match.id} already says.`)
      continue
    }
    if (statement) existing.push({ id: read(law, 'id'), words })
    drafts.push({ kind: 'iron-law', value: law })
  }

  const attach = options.attachToAgentId === null ? undefined : resolveAgent(ctx, options)
  const { changeSet, notes } = assembleChangeSet({
    blueprint: ctx.blueprint,
    source: 'ai',
    id: `ai:${createIronLawsV1.id}`,
    summary: `${drafts.length} Iron ${drafts.length === 1 ? 'Law' : 'Laws'}`,
    drafts,
    ...(attach !== undefined ? { attachToAgentId: attach } : {}),
  })

  return {
    changeSet,
    notes: [...duplicates.map((text) => `Skipped a duplicate law: ${text}`), ...notes],
    contextTrimmed: context.trimmed,
  }
}

function resolveAgent(ctx: OperationContext, options: CreateIronLawsOptions): string | undefined {
  if (options.attachToAgentId) return options.attachToAgentId
  if (ctx.selection?.kind === 'agent') return ctx.selection.id
  return undefined
}

function describeSelection(ctx: OperationContext): string | undefined {
  return ctx.selection ? `the ${ctx.selection.kind} "${ctx.selection.id}"` : undefined
}

/** One string field of something the model sent, which may be anything at all. */
function read(value: unknown, field: string): string {
  if (value === null || typeof value !== 'object') return ''
  const found = (value as Record<string, unknown>)[field]
  return typeof found === 'string' ? found : ''
}
