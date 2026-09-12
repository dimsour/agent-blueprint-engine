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

/**
 * An artifact that nearly satisfied a check, and the one thing that stopped it (P9-19).
 *
 * Reported from use: a requirement failed with "nothing in the Blueprint meets its check", and
 * the cause was a hook with the right trigger and the wrong action type — three artifacts away
 * from the requirement, with nothing on the screen pointing at it. A failed check knows what it
 * looked at; saying which candidate came closest, and why it fell short, is the difference
 * between a finding and a hunt.
 */
export interface NearMiss {
  ref: EntityRef
  /** Why this one did not count, in a clause: "its action is command, not secret-scan". */
  because: string
  /** The field on that artifact the clause is about, so the editor can mark it (P9-20). */
  field?: string
}

export interface CheckResult {
  check: RequirementCheck
  status: CheckStatus
  /** Artifacts that made the check pass, for the "why" link in the UI. */
  evidence: EntityRef[]
  /** On a failed check: the artifacts that came closest, and why each fell short. */
  nearMisses?: NearMiss[]
  /** Set when the check could not run, e.g. an invalid regular expression. */
  error?: string
}

/** Enough to point at; the fourth near miss is a list, not a pointer. */
const MAX_NEAR_MISSES = 3

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

/** "a, b, c", or "a, b, c and 4 more" — a clause, not a dump. */
function listOf(items: readonly string[]): string {
  const unique = [...new Set(items)]
  if (unique.length === 0) return 'nothing'
  if (unique.length <= 4) return unique.join(', ')
  return `${unique.slice(0, 3).join(', ')} and ${unique.length - 3} more`
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
  const fail = (error?: string, nearMisses: NearMiss[] = []): CheckResult => ({
    check,
    status: 'fail',
    evidence: [],
    ...(nearMisses.length > 0 ? { nearMisses: nearMisses.slice(0, MAX_NEAR_MISSES) } : {}),
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
      if (match) return pass([{ kind: 'workflow', id: match.id }])
      // Every workflow looked at is a near miss: it exists and has steps, just not this one.
      return fail(
        undefined,
        workflows.map((workflow) => ({
          ref: { kind: 'workflow' as const, id: workflow.id },
          because: `its steps are ${listOf(workflow.nodes.map((node) => node.type))}; none is ${check.nodeType}`,
          field: 'nodes',
        })),
      )
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
      const onTrigger = (hook: Blueprint['hooks'][number]) =>
        check.trigger === undefined || hook.trigger === check.trigger
      const onAction = (hook: Blueprint['hooks'][number]) =>
        check.actionType === undefined || hook.action.type === check.actionType
      const matches = blueprint.hooks.filter((hook) => onTrigger(hook) && onAction(hook))
      if (matches.length > 0) {
        return pass(matches.map((hook) => ({ kind: 'hook' as const, id: hook.id })))
      }
      // A hook that meets one of the two criteria is the one the author meant. Naming which
      // criterion it misses is what turns "nothing meets the check" into a one-line fix.
      return fail(
        undefined,
        blueprint.hooks
          .filter((hook) => onTrigger(hook) !== onAction(hook))
          .map((hook) => ({
            ref: { kind: 'hook' as const, id: hook.id },
            because: onTrigger(hook)
              ? `its action is ${hook.action.type}, not ${check.actionType}`
              : `it runs on ${hook.trigger}, not ${check.trigger}`,
            field: onTrigger(hook) ? 'action.type' : 'trigger',
          })),
      )
    }

    case 'gate-exists': {
      const matches = blueprint.gates.filter(
        (gate) =>
          check.criterionKind === undefined ||
          gate.criteria.some((criterion) => criterion.kind === check.criterionKind),
      )
      if (matches.length > 0) {
        return pass(matches.map((gate) => ({ kind: 'gate' as const, id: gate.id })))
      }
      return fail(
        undefined,
        blueprint.gates.map((gate) => ({
          ref: { kind: 'gate' as const, id: gate.id },
          because:
            gate.criteria.length === 0
              ? 'it has no criteria at all'
              : `its criteria are ${listOf(gate.criteria.map((criterion) => criterion.kind))}; none is ${check.criterionKind}`,
          field: 'criteria',
        })),
      )
    }

    case 'agent-has-skill-tag': {
      const tag = check.tag.toLowerCase()
      const agents = check.agentId
        ? blueprint.agents.filter((agent) => agent.id === check.agentId)
        : blueprint.agents
      const tagged = (skill: Blueprint['skills'][number]) =>
        skill.tags.some((candidateTag) => candidateTag.toLowerCase() === tag)
      for (const agent of agents) {
        const skill = blueprint.skills.find(
          (candidate) => agent.skillIds.includes(candidate.id) && tagged(candidate),
        )
        if (skill) {
          return pass([
            { kind: 'agent', id: agent.id },
            { kind: 'skill', id: skill.id },
          ])
        }
      }
      // Two ways to miss, with opposite fixes: a skill carrying the tag that no agent holds
      // wants attaching; an agent whose skills lack the tag wants a skill, or a tag.
      const holder = agents.length === 1 ? agents[0] : undefined
      const unheld = blueprint.skills
        .filter(
          (skill) => tagged(skill) && !agents.some((agent) => agent.skillIds.includes(skill.id)),
        )
        .map((skill) => ({
          ref: { kind: 'skill' as const, id: skill.id },
          because: `it is tagged "${check.tag}" but ${holder ? `agent "${holder.id}" does` : 'no agent'} not hold it`,
          field: 'tags',
        }))
      const untagged = agents
        .filter((agent) => agent.skillIds.length > 0)
        .map((agent) => ({
          ref: { kind: 'agent' as const, id: agent.id },
          because: `none of its skills (${listOf(agent.skillIds)}) is tagged "${check.tag}"`,
          field: 'skillIds',
        }))
      return fail(undefined, [...unheld, ...untagged])
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
    const pointers = nearMissesOf(failed)

    switch (result.status) {
      case 'unsatisfied':
        diagnostics.push({
          // A `must` that is not met is an error; a `should` is a warning.
          code: 'BP-REQ-001',
          severity: requirement.level === 'must' ? 'error' : 'warning',
          message: `Requirement "${requirement.name}" is not satisfied: ${requirement.statement} Nothing in the Blueprint meets ${failed.length === 1 ? 'its check' : `any of its ${failed.length} checks`}.${nearest(blueprint, pointers)}`,
          ref: result.ref,
          ...(pointers.length > 0 ? { related: pointers.map((miss) => miss.ref) } : {}),
          data: {
            failed: failed.map((check) => check.check.type),
            ...(pointers.length > 0 ? { nearMisses: pointers.map(asData) } : {}),
          },
        })
        break
      case 'partial':
        diagnostics.push({
          code: 'BP-REQ-002',
          severity: 'warning',
          message: `Requirement "${requirement.name}" is only partly satisfied: ${passed.length} of ${passed.length + failed.length} checks pass.${nearest(blueprint, pointers)}`,
          ref: result.ref,
          ...(pointers.length > 0 ? { related: pointers.map((miss) => miss.ref) } : {}),
          data: {
            passed: passed.map((check) => check.check.type),
            failed: failed.map((check) => check.check.type),
            ...(pointers.length > 0 ? { nearMisses: pointers.map(asData) } : {}),
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

/** The near misses of every failed check, each artifact once, in the order they were found. */
function nearMissesOf(failed: readonly CheckResult[]): NearMiss[] {
  const seen = new Set<string>()
  const out: NearMiss[] = []
  for (const check of failed) {
    for (const miss of check.nearMisses ?? []) {
      const key = `${miss.ref.kind}:${miss.ref.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(miss)
    }
  }
  return out
}

/**
 * The closest candidate, in the message itself.
 *
 * The message is the one line every surface shows, so the pointer has to be in it and not
 * only in `related`: a reader of the health bar sees "nothing meets its check" and needs the
 * next clause to be "the nearest is hook X — its action is command, not secret-scan".
 */
function nearest(blueprint: Blueprint, pointers: readonly NearMiss[]): string {
  const [first] = pointers
  if (!first) return ''
  const entity = getCollection(blueprint, first.ref.kind).find((e) => e.id === first.ref.id)
  const name = entity ? `"${entity.name}"` : `"${first.ref.id}"`
  const rest = pointers.length > 1 ? ` (and ${pointers.length - 1} more)` : ''
  return ` The nearest is ${first.ref.kind} ${name}${rest}: ${first.because}.`
}

/** A near miss as `data`, which is JSON: the ref flattened, the clause kept. */
function asData(miss: NearMiss): { kind: string; id: string; because: string; field?: string } {
  return {
    kind: miss.ref.kind,
    id: miss.ref.id,
    because: miss.because,
    ...(miss.field !== undefined ? { field: miss.field } : {}),
  }
}

export const requirementRule: ValidationRule = {
  code: 'BP-REQ-001',
  description: 'Requirements are verified against the Blueprint and reported as satisfied or not.',
  check: ({ blueprint }) => evaluateRequirements(blueprint).diagnostics,
}
