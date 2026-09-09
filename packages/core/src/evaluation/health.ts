/**
 * Blueprint health: the one-line answer the status bar shows, and the five findings worth
 * acting on first. Everything here is derived from the evaluation report, so the bar and the
 * evaluation view can never disagree.
 */
import { countEntities } from '../blueprint/entities'
import { buildDependencyGraph, findOrphans } from '../dependencies/graph'
import type { Blueprint } from '../model/types'
import type { EntityKind, HarnessId } from '../model/kinds'
import { type Diagnostic, summarizeDiagnostics } from '../validation/types'
import { evaluateBlueprint, type EvaluateOptions, type EvaluationReport } from './score'

export type TargetStatus = 'ok' | 'adapted' | 'limited' | 'blocked'

export interface HealthSummary {
  errors: number
  warnings: number
  infos: number
  artifacts: number
  orphans: { kind: EntityKind; count: number }[]
  targets: { harnessId: HarnessId; status: TargetStatus }[]
  overall: number
  /** The findings to show first: errors before warnings, each with an artifact to open. */
  topFindings: Diagnostic[]
}

const TOP_FINDING_COUNT = 5

export function healthSummary(
  blueprint: Blueprint,
  report: EvaluationReport = evaluateBlueprint(blueprint),
): HealthSummary {
  const counts = summarizeDiagnostics(report.diagnostics)
  const orphanCounts = new Map<EntityKind, number>()
  for (const ref of findOrphans(buildDependencyGraph(blueprint))) {
    orphanCounts.set(ref.kind, (orphanCounts.get(ref.kind) ?? 0) + 1)
  }

  const blocked = counts.errors > 0
  const targets = blueprint.targets
    .filter((target) => target.enabled)
    .map((target) => ({
      harnessId: target.harnessId,
      status: targetStatus(target.harnessId, report, blocked),
    }))

  return {
    errors: counts.errors,
    warnings: counts.warnings,
    infos: counts.infos,
    artifacts: countEntities(blueprint),
    orphans: [...orphanCounts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => (a.kind < b.kind ? -1 : 1)),
    targets,
    overall: report.overall,
    topFindings: report.diagnostics.slice(0, TOP_FINDING_COUNT),
  }
}

/**
 * A target is `blocked` while the Blueprint has errors (export is refused), otherwise it
 * reflects the worst portability finding that names it.
 */
function targetStatus(
  harnessId: HarnessId,
  report: EvaluationReport,
  blocked: boolean,
): TargetStatus {
  if (blocked) return 'blocked'
  const findings = report.diagnostics.filter(
    (diagnostic) => diagnostic.code.startsWith('BP-PORT-') && diagnostic.data?.target === harnessId,
  )
  if (findings.some((finding) => finding.code === 'BP-PORT-001')) return 'limited'
  if (findings.length > 0) return 'adapted'
  return 'ok'
}

/** Convenience wrapper for callers that only want the summary. */
export function evaluateHealth(blueprint: Blueprint, options?: EvaluateOptions): HealthSummary {
  return healthSummary(blueprint, evaluateBlueprint(blueprint, options))
}
