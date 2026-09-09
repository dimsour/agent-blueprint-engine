/**
 * Requirement verification.
 *
 * A requirement is a claim the author wants to hold about the Blueprint ("the agent must
 * verify tests before claiming success"). Each check is a small declarative query, so
 * "satisfied" is a computed fact with evidence rather than an opinion. Checks that need a
 * model (`ai-judged`) are reported as skipped here and evaluated by the AI layer.
 */
import { ENTITY_KINDS, type EntityKind } from '../model/kinds'
import { getCollection } from '../blueprint/entities'
import type { AnyEntity, Blueprint, EntityRef, Requirement, RequirementCheck } from '../model/types'
import type { ValidationRule } from './engine'
import type { Diagnostic } from './types'

export type CheckStatus = 'pass' | 'fail' | 'skipped'

export interface CheckResult {
  check: RequirementCheck
  status: CheckStatus
  /** Artifacts that made the check pass, for the "why" link in the UI. */
  evidence: EntityRef[]
  /** Set when the check could not run, e.g. an invalid regular expression. */
  error?: string
}

export type RequirementStatus = 'satisfied' | 'partial' | 'unsatisfied' | 'unverifiable'

export interface RequirementResult {
  ref: EntityRef
  status: RequirementStatus
  checks: CheckResult[]
}

/** Text fields that carry meaning for `text-mentions`, per entity kind. */
function searchableText(entity: AnyEntity): string {
  const record = entity as Record<string, unknown>
  const fields = [
    'name',
    'description',
    'body',
    'rule',
    'guidance',
    'whenToUse',
    'statement',
    'input',
  ]
  return fields
    .map((field) => record[field])
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

function safeRegExp(pattern: string): { regexp?: RegExp; error?: string } {
  try {
    return { regexp: new RegExp(pattern, 'i') }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export function evaluateCheck(blueprint: Blueprint, check: RequirementCheck): CheckResult {
  const pass = (evidence: EntityRef[]): CheckResult => ({ check, status: 'pass', evidence })
  const fail = (error?: string): CheckResult => ({
    check,
    status: 'fail',
    evidence: [],
    ...(error === undefined ? {} : { error }),
  })

  switch (check.type) {
    case 'workflow-has-node-type': {
      const workflows = check.workflowId
        ? blueprint.workflows.filter((workflow) => workflow.id === check.workflowId)
        : blueprint.workflows
      const match = workflows.find((workflow) =>
        workflow.nodes.some((node) => node.type === check.nodeType),
      )
      return match ? pass([{ kind: 'workflow', id: match.id }]) : fail()
    }

    case 'iron-law-matches': {
      const { regexp, error } = safeRegExp(check.pattern)
      if (!regexp) return fail(error)
      const matches = blueprint.ironLaws.filter(
        (law) => regexp.test(law.name) || regexp.test(law.rule) || regexp.test(law.body),
      )
      return matches.length > 0
        ? pass(matches.map((law) => ({ kind: 'iron-law' as const, id: law.id })))
        : fail()
    }

    case 'hook-exists': {
      const matches = blueprint.hooks.filter(
        (hook) =>
          (check.trigger === undefined || hook.trigger === check.trigger) &&
          (check.actionType === undefined || hook.action.type === check.actionType),
      )
      return matches.length > 0
        ? pass(matches.map((hook) => ({ kind: 'hook' as const, id: hook.id })))
        : fail()
    }

    case 'gate-exists': {
      const matches = blueprint.gates.filter(
        (gate) =>
          check.criterionKind === undefined ||
          gate.criteria.some((criterion) => criterion.kind === check.criterionKind),
      )
      return matches.length > 0
        ? pass(matches.map((gate) => ({ kind: 'gate' as const, id: gate.id })))
        : fail()
    }

    case 'agent-has-skill-tag': {
      const tag = check.tag.toLowerCase()
      const agents = check.agentId
        ? blueprint.agents.filter((agent) => agent.id === check.agentId)
        : blueprint.agents
      for (const agent of agents) {
        const skill = blueprint.skills.find(
          (candidate) =>
            agent.skillIds.includes(candidate.id) &&
            candidate.tags.some((candidateTag) => candidateTag.toLowerCase() === tag),
        )
        if (skill) {
          return pass([
            { kind: 'agent', id: agent.id },
            { kind: 'skill', id: skill.id },
          ])
        }
      }
      return fail()
    }

    case 'text-mentions': {
      const { regexp, error } = safeRegExp(check.pattern)
      if (!regexp) return fail(error)
      const kinds: readonly EntityKind[] = check.kinds.length > 0 ? check.kinds : ENTITY_KINDS
      const evidence: EntityRef[] = []
      for (const kind of kinds) {
        for (const entity of getCollection(blueprint, kind)) {
          if (regexp.test(searchableText(entity))) evidence.push({ kind, id: entity.id })
        }
      }
      return evidence.length > 0 ? pass(evidence) : fail()
    }

    case 'ai-judged':
      // Left to the AI layer, which fills in pass/fail with a rationale.
      return { check, status: 'skipped', evidence: [] }
  }
}

export function evaluateRequirement(
  blueprint: Blueprint,
  requirement: Requirement,
): RequirementResult {
  const checks = requirement.checks.map((check) => evaluateCheck(blueprint, check))
  const evaluated = checks.filter((result) => result.status !== 'skipped')
  const passed = evaluated.filter((result) => result.status === 'pass')

  const status: RequirementStatus =
    evaluated.length === 0
      ? 'unverifiable'
      : passed.length === evaluated.length
        ? 'satisfied'
        : passed.length === 0
          ? 'unsatisfied'
          : 'partial'

  return { ref: { kind: 'requirement', id: requirement.id }, status, checks }
}

export interface RequirementsReport {
  results: RequirementResult[]
  diagnostics: Diagnostic[]
}

export function evaluateRequirements(blueprint: Blueprint): RequirementsReport {
  const results = blueprint.requirements.map((requirement) =>
    evaluateRequirement(blueprint, requirement),
  )
  const diagnostics: Diagnostic[] = []

  for (const [index, result] of results.entries()) {
    const requirement = blueprint.requirements[index]
    if (!requirement) continue
    const failed = result.checks.filter((check) => check.status === 'fail')
    const passed = result.checks.filter((check) => check.status === 'pass')

    switch (result.status) {
      case 'unsatisfied':
        diagnostics.push({
          // A `must` that is not met is an error; a `should` is a warning.
          code: 'BP-REQ-001',
          severity: requirement.level === 'must' ? 'error' : 'warning',
          message: `Requirement "${requirement.name}" is not satisfied: ${requirement.statement} Nothing in the Blueprint meets ${failed.length === 1 ? 'its check' : `any of its ${failed.length} checks`}.`,
          ref: result.ref,
          data: { failed: failed.map((check) => check.check.type) },
        })
        break
      case 'partial':
        diagnostics.push({
          code: 'BP-REQ-002',
          severity: 'warning',
          message: `Requirement "${requirement.name}" is only partly satisfied: ${passed.length} of ${passed.length + failed.length} checks pass.`,
          ref: result.ref,
          data: {
            passed: passed.map((check) => check.check.type),
            failed: failed.map((check) => check.check.type),
          },
        })
        break
      case 'unverifiable':
        diagnostics.push(
          result.checks.length === 0
            ? {
                code: 'BP-REQ-003',
                severity: 'info',
                message: `Requirement "${requirement.name}" has no checks, so it cannot be verified automatically. Add a check or treat it as documentation.`,
                ref: result.ref,
              }
            : {
                code: 'BP-REQ-004',
                severity: 'info',
                message: `Requirement "${requirement.name}" can only be judged by a model, and no AI provider is configured, so it was skipped.`,
                ref: result.ref,
              },
        )
        break
      case 'satisfied':
        break
    }

    for (const check of result.checks) {
      if (check.error === undefined) continue
      diagnostics.push({
        code: 'BP-REQ-005',
        severity: 'warning',
        message: `Requirement "${requirement.name}" has a check that could not run: ${check.error}`,
        ref: result.ref,
      })
    }
  }

  return { results, diagnostics }
}

export const requirementRule: ValidationRule = {
  code: 'BP-REQ-001',
  description: 'Requirements are verified against the Blueprint and reported as satisfied or not.',
  check: ({ blueprint }) => evaluateRequirements(blueprint).diagnostics,
}
