/**
 * Blueprint evaluation.
 *
 * A score exists to point at work, not to decorate a dashboard: every dimension carries the
 * findings that produced it, and every finding names an artifact. Scores come from the same
 * diagnostics the validator produces plus a few heuristics that are quality judgements
 * rather than correctness ones (a skill with a 40-character body is valid and useless).
 *
 * The report is a pure function of the Blueprint: no clock, no randomness, no ids.
 */
import { countEntities } from '../blueprint/entities'
import { BLUEPRINT_SCHEMA_VERSION } from '../schema/blueprint'
import type { Blueprint } from '../model/types'
import { ALL_RULES, validateBlueprint } from '../validation/engine'
import { evaluateRequirements, type RequirementResult } from '../validation/requirements'
import { jaccard, keywords } from '../validation/text'
import { type Diagnostic, sortDiagnostics } from '../validation/types'

export type DimensionId =
  | 'skills'
  | 'agents'
  | 'workflows'
  | 'ironLaws'
  | 'consistency'
  | 'portability'
  | 'coverage'
  | 'verification'
  | 'safety'
  | 'complexity'

export interface DimensionScore {
  id: DimensionId
  label: string
  score: number
  weight: number
  findings: Diagnostic[]
}

export interface EvaluationReport {
  overall: number
  dimensions: DimensionScore[]
  requirements: RequirementResult[]
  /** Every diagnostic that fed the score, sorted. */
  diagnostics: Diagnostic[]
  /** Identifies what produced the report. Deliberately free of timestamps. */
  computedFrom: { schemaVersion: string; rulesVersion: string }
}

/** Bumped when a rule or heuristic changes what a score means. */
export const RULES_VERSION = '1.0.0'

const PENALTY: Record<Diagnostic['severity'], number> = { error: 15, warning: 5, info: 1 }

interface DimensionSpec {
  id: DimensionId
  label: string
  weight: number
  /** Diagnostics from validation that count against this dimension. */
  matches(diagnostic: Diagnostic): boolean
}

const startsWith =
  (...prefixes: string[]) =>
  (diagnostic: Diagnostic) =>
    prefixes.some((prefix) => diagnostic.code.startsWith(prefix))

const isKind = (code: string, kind: string) => (diagnostic: Diagnostic) =>
  diagnostic.code === code && diagnostic.ref?.kind === kind

const any =
  (...matchers: ((diagnostic: Diagnostic) => boolean)[]) =>
  (diagnostic: Diagnostic) =>
    matchers.some((matcher) => matcher(diagnostic))

const DIMENSIONS: DimensionSpec[] = [
  {
    id: 'skills',
    label: 'Skills',
    weight: 1,
    matches: any(
      startsWith('BP-SKILL-'),
      isKind('BP-DESC-001', 'skill'),
      startsWith('BP-ORPHAN-001'),
    ),
  },
  {
    id: 'agents',
    label: 'Agents',
    weight: 1,
    matches: any(startsWith('BP-AGENT-'), isKind('BP-DESC-001', 'agent')),
  },
  {
    id: 'workflows',
    label: 'Workflows',
    weight: 1,
    matches: any(
      startsWith('BP-WF-'),
      isKind('BP-DESC-001', 'workflow'),
      startsWith('BP-ORPHAN-002'),
    ),
  },
  {
    id: 'ironLaws',
    label: 'Iron Laws',
    weight: 1,
    matches: any(
      startsWith('BP-LAW-'),
      isKind('BP-DESC-001', 'iron-law'),
      startsWith('BP-ORPHAN-003'),
    ),
  },
  {
    id: 'consistency',
    label: 'Consistency',
    weight: 1.5,
    matches: startsWith('BP-CONTRA-', 'BP-LAW-010', 'BP-REF-', 'BP-ID-'),
  },
  { id: 'portability', label: 'Portability', weight: 1, matches: startsWith('BP-PORT-') },
  {
    id: 'coverage',
    label: 'Coverage',
    weight: 1,
    matches: startsWith('BP-AGENT-011', 'BP-REQ-', 'BP-ORPHAN-'),
  },
  {
    id: 'verification',
    label: 'Verification',
    weight: 1.5,
    matches: startsWith('BP-WF-011', 'BP-GATE-', 'BP-HOOK-', 'BP-LAW-011'),
  },
  { id: 'safety', label: 'Safety', weight: 1.5, matches: startsWith('BP-SAFETY-') },
  { id: 'complexity', label: 'Complexity', weight: 0.5, matches: startsWith('BP-EVAL-COMPLEX') },
]

/** A quality observation that is not a validation error. Evaluation-only codes. */
function finding(
  code: string,
  message: string,
  penalty: number,
  ref?: Diagnostic['ref'],
): Diagnostic & { penalty: number } {
  return {
    code,
    severity: 'info',
    message,
    ...(ref ? { ref } : {}),
    data: { penalty },
    penalty,
  }
}

type Heuristic = Diagnostic & { penalty: number }

/** Quality heuristics per dimension, from docs/05-validation-evaluation.md §6. */
function heuristics(blueprint: Blueprint): Record<DimensionId, Heuristic[]> {
  const out: Record<DimensionId, Heuristic[]> = {
    skills: [],
    agents: [],
    workflows: [],
    ironLaws: [],
    consistency: [],
    portability: [],
    coverage: [],
    verification: [],
    safety: [],
    complexity: [],
  }

  for (const skill of blueprint.skills) {
    const ref = { kind: 'skill' as const, id: skill.id }
    if (skill.body.length < 200) {
      out.skills.push(
        finding(
          'BP-EVAL-SKILL-001',
          `Skill "${skill.name}" has only ${skill.body.length} characters of instructions, which is rarely enough to change how an agent behaves.`,
          5,
          ref,
        ),
      )
    }
    if (!/^#{1,6}\s*instructions\b/im.test(skill.body)) {
      out.skills.push(
        finding(
          'BP-EVAL-SKILL-002',
          `Skill "${skill.name}" has no Instructions section, so it describes a topic rather than telling the agent what to do.`,
          3,
          ref,
        ),
      )
    }
  }

  for (const agent of blueprint.agents) {
    const ref = { kind: 'agent' as const, id: agent.id }
    if (agent.outputRequirements.length === 0) {
      out.agents.push(
        finding(
          'BP-EVAL-AGENT-001',
          `Agent "${agent.name}" states no output requirements, so nothing defines what "done" looks like.`,
          5,
          ref,
        ),
      )
    }
    if (agent.skillIds.length > 12) {
      out.complexity.push(
        finding(
          'BP-EVAL-COMPLEX-003',
          `Agent "${agent.name}" has ${agent.skillIds.length} skills; past about a dozen, harnesses stop loading them reliably.`,
          1,
          ref,
        ),
      )
    }
  }

  for (const workflow of blueprint.workflows) {
    const ref = { kind: 'workflow' as const, id: workflow.id }
    if (workflow.triggers.intents.length === 0 && workflow.triggers.agentIds.length === 0) {
      out.workflows.push(
        finding(
          'BP-EVAL-WF-001',
          `Workflow "${workflow.name}" has no triggers, so the agent has to be told to use it explicitly.`,
          5,
          ref,
        ),
      )
    }
    if (workflow.nodes.length > 25) {
      out.complexity.push(
        finding(
          'BP-EVAL-COMPLEX-001',
          `Workflow "${workflow.name}" has ${workflow.nodes.length} steps; long workflows are harder to follow than a workflow that delegates to another.`,
          2,
          ref,
        ),
      )
    }
  }

  for (const law of blueprint.ironLaws) {
    const ref = { kind: 'iron-law' as const, id: law.id }
    if (!law.rationale) {
      out.ironLaws.push(
        finding(
          'BP-EVAL-LAW-001',
          `Iron Law "${law.name}" gives no rationale. A law the agent understands is followed more reliably than one it does not.`,
          3,
          ref,
        ),
      )
    }
    if (law.examples.length === 0 && law.counterexamples.length === 0) {
      out.ironLaws.push(
        finding(
          'BP-EVAL-LAW-002',
          `Iron Law "${law.name}" has no examples, so its boundary is open to interpretation.`,
          2,
          ref,
        ),
      )
    }
  }

  // Verification: does anything actually check the agent's work?
  const hasVerificationNode = blueprint.workflows.some((workflow) =>
    workflow.nodes.some((node) => node.type === 'verification'),
  )
  if (blueprint.workflows.length > 0 && !hasVerificationNode) {
    out.verification.push(
      finding(
        'BP-EVAL-VERIFY-001',
        'No workflow has a verification step, so nothing in this Blueprint observes a result before reporting it.',
        10,
      ),
    )
  }
  if (blueprint.gates.length === 0) {
    out.verification.push(
      finding(
        'BP-EVAL-VERIFY-002',
        'There are no gates, so no checkpoint can stop work that is not finished.',
        5,
      ),
    )
  }
  const checkingHooks = new Set(['run-tests', 'lint', 'secret-scan'])
  if (!blueprint.hooks.some((hook) => checkingHooks.has(hook.action.type))) {
    out.verification.push(
      finding(
        'BP-EVAL-VERIFY-003',
        'No hook runs tests, a linter or a secret scan, so verification depends entirely on the agent remembering to do it.',
        5,
      ),
    )
  }

  // Safety
  for (const agent of blueprint.agents) {
    const ref = { kind: 'agent' as const, id: agent.id }
    if (agent.permissions.operations['git.force-push'] === 'allow') {
      out.safety.push(
        finding(
          'BP-SAFETY-001',
          `Agent "${agent.name}" may force-push without asking, which can destroy work that is not recoverable.`,
          10,
          ref,
        ),
      )
    }
    const hasSecurityLaw = blueprint.ironLaws.some((law) => law.category === 'security')
    if (agent.permissions.operations['net.any'] === 'allow' && !hasSecurityLaw) {
      out.safety.push(
        finding(
          'BP-SAFETY-002',
          `Agent "${agent.name}" may make arbitrary network requests and no Iron Law constrains what it may send.`,
          10,
          ref,
        ),
      )
    }
  }
  if (
    blueprint.ironLaws.length > 0 &&
    !blueprint.ironLaws.some((law) => law.category === 'security')
  ) {
    out.safety.push(
      finding(
        'BP-SAFETY-003',
        'No Iron Law covers security, so nothing states what the agent must never do with credentials or data.',
        5,
      ),
    )
  }
  if (!blueprint.hooks.some((hook) => hook.action.type === 'secret-scan')) {
    out.safety.push(
      finding(
        'BP-SAFETY-004',
        'No hook scans for secrets, so a leaked credential would only be caught by review.',
        5,
      ),
    )
  }

  // Redundancy: two skills that describe the same thing compete for activation.
  for (let i = 0; i < blueprint.skills.length; i += 1) {
    for (let j = i + 1; j < blueprint.skills.length; j += 1) {
      const a = blueprint.skills[i]
      const b = blueprint.skills[j]
      if (!a || !b) continue
      const overlap = jaccard(keywords(a.description ?? a.name), keywords(b.description ?? b.name))
      if (overlap < 0.7) continue
      out.complexity.push(
        finding(
          'BP-EVAL-COMPLEX-002',
          `Skills "${a.name}" and "${b.name}" describe nearly the same thing, so a harness cannot tell which one to load.`,
          3,
          { kind: 'skill', id: a.id },
        ),
      )
    }
  }

  return out
}

export interface EvaluateOptions {
  /**
   * Portability is computed from harness capability matrices, which live in the exporters
   * package. Core stays independent of them by taking the computation as an argument.
   */
  portability?: (blueprint: Blueprint) => { score: number; issues: Diagnostic[] }
  /** Pre-computed diagnostics, to avoid validating twice. */
  diagnostics?: Diagnostic[]
}

export function evaluateBlueprint(
  blueprint: Blueprint,
  options: EvaluateOptions = {},
): EvaluationReport {
  const validation = options.diagnostics ?? validateBlueprint(blueprint)
  const portability = options.portability?.(blueprint)
  const requirements = evaluateRequirements(blueprint).results
  const extra = heuristics(blueprint)

  const all = [...validation, ...(portability?.issues ?? [])]
  const dimensions: DimensionScore[] = DIMENSIONS.map((spec) => {
    const matched = all.filter((diagnostic) => spec.matches(diagnostic))
    const own = extra[spec.id]
    const findings = [...matched, ...own]

    let score =
      100 -
      matched.reduce((total, diagnostic) => total + PENALTY[diagnostic.severity], 0) -
      own.reduce((total, heuristic) => total + heuristic.penalty, 0)

    if (spec.id === 'ironLaws' && blueprint.ironLaws.length === 0) {
      // A Blueprint with no Iron Laws has nothing that cannot be argued away.
      score = 40
      findings.push(
        finding(
          'BP-EVAL-LAW-003',
          'This Blueprint has no Iron Laws, so there is nothing the agent must never do.',
          0,
        ),
      )
    }

    if (spec.id === 'portability') {
      if (portability) score = portability.score
      else {
        score = 100
        findings.push(
          finding(
            'BP-EVAL-PORT-001',
            'Portability was not assessed: no harness capability data was provided to the evaluator.',
            0,
          ),
        )
      }
    }

    if (spec.id === 'coverage') {
      const verifiable = requirements.filter((result) => result.status !== 'unverifiable')
      if (verifiable.length > 0) {
        const satisfied = verifiable.filter((result) => result.status === 'satisfied').length
        score = score * (satisfied / verifiable.length)
      }
    }

    return {
      id: spec.id,
      label: spec.label,
      score: Math.max(0, Math.round(score)),
      weight: spec.weight,
      findings: sortDiagnostics(findings),
    }
  })

  const totalWeight = dimensions.reduce((total, dimension) => total + dimension.weight, 0)
  const overall = Math.round(
    dimensions.reduce((total, dimension) => total + dimension.weight * dimension.score, 0) /
      totalWeight,
  )

  return {
    overall,
    dimensions,
    requirements,
    diagnostics: sortDiagnostics([...all, ...Object.values(extra).flat()]),
    computedFrom: { schemaVersion: BLUEPRINT_SCHEMA_VERSION, rulesVersion: RULES_VERSION },
  }
}

/** Total number of artifacts, exposed for the health summary. */
export function artifactCount(blueprint: Blueprint): number {
  return countEntities(blueprint)
}

/** Every rule code the evaluator knows about, for the documentation test. */
export function knownRuleCodes(): string[] {
  return ALL_RULES.map((rule) => rule.code)
}
