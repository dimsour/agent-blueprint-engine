/**
 * The requirement checks that need a reader rather than a query.
 *
 * `evaluateCheck` in core reports `ai-judged` checks as skipped, because a deterministic
 * validator cannot answer "does the agent explain its reasoning before acting". This answers
 * them, and it does so as diagnostics carrying `data.source: 'ai'` — a verdict a model reached
 * sits beside the ones a rule computed, and the user can see at a glance which is which.
 *
 * Only failures and uncertainties become findings. A check that passed is not news; it is the
 * requirement doing its job, and the evaluation view already shows the requirement.
 */
import { type Blueprint, type Diagnostic, type Requirement } from '@agent-blueprint/core'

import { judgeRequirementsV1 } from '../prompts/judge-requirements.v1'
import { judgeRequirementsOutputSchema, type RequirementVerdict } from '../schemas/outputs'
import { AI_REQUIREMENT_CODE } from './codes'
import { ask, contextFor } from './run'
import type { DiagnosticsResult, OperationContext, OperationDeps } from './types'

/** How a check is addressed on the wire: the requirement it belongs to and its position. */
export function checkId(requirementId: string, index: number): string {
  return `${requirementId}#${index}`
}

export interface JudgedCheck {
  requirementId: string
  index: number
  verdict: RequirementVerdict
}

export interface JudgeRequirementsResult extends DiagnosticsResult {
  /** Every verdict, including the passes, for a view that shows checks rather than findings. */
  verdicts: JudgedCheck[]
}

/** The `ai-judged` checks in a Blueprint, in a stable order. */
export function aiJudgedChecks(
  blueprint: Blueprint,
): { requirement: Requirement; index: number; prompt: string }[] {
  const out: { requirement: Requirement; index: number; prompt: string }[] = []
  for (const requirement of blueprint.requirements) {
    requirement.checks.forEach((check, index) => {
      if (check.type === 'ai-judged') out.push({ requirement, index, prompt: check.prompt })
    })
  }
  return out
}

export async function judgeRequirements(
  deps: OperationDeps,
  ctx: OperationContext,
): Promise<JudgeRequirementsResult> {
  const pending = aiJudgedChecks(ctx.blueprint)
  const context = contextFor(ctx, deps, judgeRequirementsV1.system)
  if (pending.length === 0) {
    return { diagnostics: [], verdicts: [], notes: [], contextTrimmed: context.trimmed }
  }

  const answer = await ask(
    deps,
    judgeRequirementsV1,
    {
      checks: pending.map((entry) => ({
        id: checkId(entry.requirement.id, entry.index),
        requirement: entry.requirement.statement,
        prompt: entry.prompt,
      })),
    },
    judgeRequirementsOutputSchema,
    context,
  )

  const notes: string[] = []
  const verdicts: JudgedCheck[] = []
  const diagnostics: Diagnostic[] = []

  for (const verdict of answer.value.verdicts) {
    const entry = pending.find(
      (candidate) => checkId(candidate.requirement.id, candidate.index) === verdict.id,
    )
    if (!entry) {
      notes.push(`Ignored a verdict for "${verdict.id}", which is not a check in this Blueprint.`)
      continue
    }
    verdicts.push({ requirementId: entry.requirement.id, index: entry.index, verdict })
    if (verdict.status === 'pass') continue
    diagnostics.push({
      code: AI_REQUIREMENT_CODE,
      severity: verdict.status === 'fail' ? 'warning' : 'info',
      message: `${entry.requirement.statement} — ${verdict.rationale}`,
      ref: { kind: 'requirement', id: entry.requirement.id },
      data: { source: 'ai', status: verdict.status, checkIndex: entry.index },
    })
  }

  const judged = new Set(verdicts.map((entry) => checkId(entry.requirementId, entry.index)))
  const missed = pending.filter(
    (entry) => !judged.has(checkId(entry.requirement.id, entry.index)),
  ).length
  if (missed > 0) {
    notes.push(`${missed} ${missed === 1 ? 'check was' : 'checks were'} not judged.`)
  }

  return { diagnostics, verdicts, notes, contextTrimmed: context.trimmed }
}
