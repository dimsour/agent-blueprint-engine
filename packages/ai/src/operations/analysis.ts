/**
 * The three operations that report rather than propose.
 *
 * All of them share one rule: a finding that names an artifact which does not exist is
 * dropped. It is tempting to show it anyway — the model may still be onto something — but a
 * finding in this product is a thing you click to get to the artifact, and one that goes
 * nowhere teaches the user that the list is not to be trusted. Being told about five real
 * problems is worth more than five real ones and two ghosts.
 */
import { type Diagnostic, type EntityRef, hasEntity } from '@agent-blueprint/core'

import { evaluateV1 } from '../prompts/evaluate.v1'
import { findContradictionsV1 } from '../prompts/find-contradictions.v1'
import { findMissingV1 } from '../prompts/find-missing.v1'
import {
  type AIEvaluationReport,
  evaluateOutputSchema,
  findContradictionsOutputSchema,
  findMissingOutputSchema,
} from '../schemas/outputs'
import { assembleChangeSet, type Draft } from './assemble'
import { AI_CONTRADICTION_CODE, AI_MISSING_CODE, severityFor } from './codes'
import { ask, contextFor } from './run'
import type {
  ChangeSetResult,
  DiagnosticsResult,
  OperationContext,
  OperationDeps,
  OperationMeta,
} from './types'

export async function findContradictions(
  deps: OperationDeps,
  ctx: OperationContext,
): Promise<DiagnosticsResult> {
  const context = contextFor(ctx, deps, findContradictionsV1.system)
  const answer = await ask(
    deps,
    findContradictionsV1,
    ctx.instruction !== undefined ? { instruction: ctx.instruction } : {},
    findContradictionsOutputSchema,
    context,
  )

  const notes: string[] = []
  const diagnostics: Diagnostic[] = []
  for (const found of answer.value.contradictions) {
    if (!both(ctx, found.first, found.second)) {
      notes.push(
        `Dropped a finding about ${found.first.id} and ${found.second.id}: no such artifact.`,
      )
      continue
    }
    diagnostics.push({
      code: AI_CONTRADICTION_CODE,
      severity: 'warning',
      message: found.recommendation ? `${found.conflict} ${found.recommendation}` : found.conflict,
      ref: found.first,
      related: [found.second],
      data: { source: 'ai', claimedSeverity: found.severity },
    })
  }
  return { diagnostics, notes, contextTrimmed: context.trimmed }
}

export interface FindMissingResult extends DiagnosticsResult {
  /** Artifacts the model would write to close the gaps. May hold no ops. */
  proposals: ChangeSetResult
}

export async function findMissing(
  deps: OperationDeps,
  ctx: OperationContext,
): Promise<FindMissingResult> {
  const context = contextFor(ctx, deps, findMissingV1.system)
  const answer = await ask(
    deps,
    findMissingV1,
    ctx.instruction !== undefined ? { instruction: ctx.instruction } : {},
    findMissingOutputSchema,
    context,
  )

  const notes: string[] = []
  const diagnostics: Diagnostic[] = []
  for (const gap of answer.value.gaps) {
    const ref = gap.implicatedBy
    if (ref && !hasEntity(ctx.blueprint, ref)) {
      notes.push(`Dropped a gap about ${ref.kind}:${ref.id}: no such artifact.`)
      continue
    }
    diagnostics.push({
      code: AI_MISSING_CODE,
      severity: severityFor(gap.severity),
      message: `${gap.title} — ${gap.why}`,
      ...(ref ? { ref } : {}),
      data: { source: 'ai', claimedSeverity: gap.severity },
    })
  }

  const drafts: Draft[] = answer.value.proposals.map((proposal) => ({
    kind: proposal.kind,
    value: proposal.artifact,
    ...(proposal.note !== undefined ? { note: proposal.note } : {}),
  }))
  const assembled = assembleChangeSet({
    blueprint: ctx.blueprint,
    source: 'ai',
    id: `ai:${findMissingV1.id}`,
    summary: `${drafts.length} proposed ${drafts.length === 1 ? 'artifact' : 'artifacts'}`,
    drafts,
  })

  return {
    diagnostics,
    notes,
    contextTrimmed: context.trimmed,
    proposals: {
      changeSet: assembled.changeSet,
      notes: assembled.notes,
      contextTrimmed: context.trimmed,
    },
  }
}

export interface EvaluateResult extends OperationMeta {
  report: AIEvaluationReport
}

export async function evaluate(
  deps: OperationDeps,
  ctx: OperationContext,
): Promise<EvaluateResult> {
  const context = contextFor(ctx, deps, evaluateV1.system)
  const answer = await ask(
    deps,
    evaluateV1,
    ctx.instruction !== undefined ? { instruction: ctx.instruction } : {},
    evaluateOutputSchema,
    context,
  )

  const notes: string[] = []
  const dimensions = answer.value.dimensions.map((dimension) => ({
    ...dimension,
    findings: dimension.findings.filter((finding) => {
      if (!finding.ref || hasEntity(ctx.blueprint, finding.ref)) return true
      notes.push(
        `Dropped a ${dimension.dimension} finding about ${finding.ref.id}: no such artifact.`,
      )
      return false
    }),
  }))

  return { report: { dimensions }, notes, contextTrimmed: context.trimmed }
}

function both(ctx: OperationContext, first: EntityRef, second: EntityRef): boolean {
  return hasEntity(ctx.blueprint, first) && hasEntity(ctx.blueprint, second)
}
