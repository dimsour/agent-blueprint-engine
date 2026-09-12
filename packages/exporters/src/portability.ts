/**
 * Portability: how much of a Blueprint survives compilation to the targets it enables.
 *
 * Only features the Blueprint actually uses count. A Blueprint with no memory definitions is
 * not penalised for targeting a harness without memory, and a Blueprint that uses every
 * concept is scored against every target's real capability matrix.
 *
 * Formula (docs/05-validation-evaluation.md §6): native 1, adapted 0.8, limited 0.5,
 * unsupported 0, averaged over (used feature × enabled target) and multiplied by 100.
 */
import type { Blueprint, Diagnostic, HarnessId } from '@agent-blueprint/core'
import { HARNESS_LABELS } from '@agent-blueprint/core'

import { enabledTargets } from './pipeline'
import { adapterFor } from './registry'
import {
  type CapabilityMatrix,
  type Concept,
  CONCEPT_LABELS,
  CONCEPTS,
  type SupportLevel,
} from './types'

const SUPPORT_WEIGHT: Record<SupportLevel, number> = {
  native: 1,
  adapted: 0.8,
  limited: 0.5,
  unsupported: 0,
}

/** Which concepts the Blueprint actually relies on. */
export function usedConcepts(blueprint: Blueprint): Concept[] {
  const primaryId = blueprint.settings.primaryAgentId ?? blueprint.agents[0]?.id
  const primary = blueprint.agents.find((agent) => agent.id === primaryId)
  const usesPermissions =
    primary !== undefined &&
    (Object.values(primary.permissions.operations).some((decision) => decision !== 'allow') ||
      primary.permissions.patterns.length > 0)

  const used: Record<Concept, boolean> = {
    skills: blueprint.skills.length > 0,
    agents: blueprint.agents.length > 1,
    parallelAgents: blueprint.workflows.some((workflow) =>
      workflow.edges.some((edge) => edge.kind === 'parallel'),
    ),
    workflows: blueprint.workflows.length > 0,
    hooks: blueprint.hooks.length > 0,
    gates: blueprint.gates.length > 0,
    permissions: usesPermissions,
    memory: blueprint.memories.some((memory) => memory.scope !== 'stateless'),
    pathScopedRules: blueprint.rules.some((rule) => rule.paths.length > 0),
    commands: blueprint.workflows.length > 0 || blueprint.skills.length > 0,
    ironLaws: blueprint.ironLaws.length > 0,
    references: blueprint.references.length > 0,
  }
  return CONCEPTS.filter((concept) => used[concept])
}

export interface PortabilityResult {
  /** 0 to 100. 100 when nothing is enabled, with an explanatory info diagnostic. */
  score: number
  issues: Diagnostic[]
  /** Support level per concept and target, for the compatibility view. */
  matrix: { concept: Concept; used: boolean; byTarget: Partial<Record<HarnessId, SupportLevel>> }[]
}

/**
 * The support matrix a target has for this Blueprint's options — a plugin layout cannot
 * carry what a project layout can. Invalid options fall back to the default matrix; the
 * pipeline reports them as `BP-TARGET-003` on its own.
 */
export function capabilitiesOf(blueprint: Blueprint, target: HarnessId): CapabilityMatrix {
  const adapter = adapterFor(target)
  if (!adapter.capabilitiesFor) return adapter.capabilities
  const raw = blueprint.targets.find((config) => config.harnessId === target)?.options ?? {}
  try {
    return adapter.capabilitiesFor(adapter.parseOptions(raw))
  } catch {
    return adapter.capabilities
  }
}

export function portabilityOf(
  blueprint: Blueprint,
  options: { targets?: HarnessId[] } = {},
): PortabilityResult {
  const targets = enabledTargets(blueprint, options.targets)
  const used = new Set(usedConcepts(blueprint))

  const matrix = CONCEPTS.map((concept) => ({
    concept,
    used: used.has(concept),
    byTarget: Object.fromEntries(
      targets.map((target) => [target, capabilitiesOf(blueprint, target)[concept].support]),
    ),
  }))

  if (targets.length === 0) {
    return {
      score: 100,
      issues: [
        {
          code: 'BP-TARGET-001',
          severity: 'info',
          message: 'No export target is enabled, so portability cannot be assessed.',
        },
      ],
      matrix,
    }
  }

  const issues: Diagnostic[] = []
  let total = 0
  let count = 0

  for (const concept of CONCEPTS) {
    if (!used.has(concept)) continue
    for (const target of targets) {
      const capability = capabilitiesOf(blueprint, target)[concept]
      total += SUPPORT_WEIGHT[capability.support]
      count += 1

      if (capability.support === 'unsupported') {
        issues.push({
          code: 'BP-PORT-001',
          severity: 'warning',
          message: `${CONCEPT_LABELS[concept]} are used by this Blueprint but unsupported on ${HARNESS_LABELS[target]}. ${capability.explanation}`,
          data: { concept, target, support: capability.support },
        })
      } else if (capability.support !== 'native') {
        issues.push({
          code: 'BP-PORT-002',
          severity: 'info',
          message: `${CONCEPT_LABELS[concept]} are ${capability.support} on ${HARNESS_LABELS[target]}. ${capability.explanation}`,
          data: { concept, target, support: capability.support },
        })
      }
    }
  }

  return {
    score: count === 0 ? 100 : Math.round((total / count) * 100),
    issues,
    matrix,
  }
}

/** Shape expected by `evaluateBlueprint` in core, which must not import this package. */
export function portabilityProvider(options: { targets?: HarnessId[] } = {}) {
  return (blueprint: Blueprint) => {
    const result = portabilityOf(blueprint, options)
    return { score: result.score, issues: result.issues }
  }
}
