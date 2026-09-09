/**
 * Putting a model's findings next to the validator's, without pretending they are the same.
 *
 * They belong side by side: a contradiction the rules cannot see and one they can are both
 * about the same Blueprint, and making the user look in two places to find them is how one of
 * the two gets ignored. But they are not interchangeable. A rule is reproducible and a model is
 * not, so AI findings are marked, they can be hidden, and — this is the part worth being
 * careful about — **they do not change the score**.
 *
 * A score that moves because a model was in a mood is a score nobody can act on. The number
 * stays the validator's; the model adds findings beside it.
 */
import type { Diagnostic, DimensionId, EvaluationReport } from '@agent-blueprint/core'

/** Which dimension each AI code belongs beside. */
const DIMENSION_FOR_CODE: Record<string, DimensionId> = {
  'BP-AI-CONTRA-001': 'consistency',
  'BP-AI-MISSING-001': 'coverage',
  'BP-AI-REQ-001': 'coverage',
}

const FALLBACK_DIMENSION: DimensionId = 'consistency'

export function isAiFinding(diagnostic: Diagnostic): boolean {
  return diagnostic.data?.['source'] === 'ai'
}

/**
 * A report with the model's findings folded into their dimensions. Scores and weights are
 * copied through untouched, and the report's own `diagnostics` list — the one the score was
 * computed from — is left alone, so nothing downstream can mistake a model's finding for an
 * input to the number.
 */
export function withAiFindings(
  report: EvaluationReport,
  findings: readonly Diagnostic[],
): EvaluationReport {
  if (findings.length === 0) return report

  const byDimension = new Map<DimensionId, Diagnostic[]>()
  for (const finding of findings) {
    const id = DIMENSION_FOR_CODE[finding.code] ?? FALLBACK_DIMENSION
    const list = byDimension.get(id)
    if (list) list.push(finding)
    else byDimension.set(id, [finding])
  }

  return {
    ...report,
    dimensions: report.dimensions.map((dimension) => {
      const extra = byDimension.get(dimension.id)
      if (!extra) return dimension
      // Appended, not merged in order: the findings that cost points come first, and what a
      // model added sits after them.
      return { ...dimension, findings: [...dimension.findings, ...extra] }
    }),
  }
}

/** Findings a model produced that are about the same thing something else already said. */
export function withoutDuplicates(
  findings: readonly Diagnostic[],
  existing: readonly Diagnostic[],
): Diagnostic[] {
  const seen = new Set(existing.map(fingerprint))
  const out: Diagnostic[] = []
  for (const finding of findings) {
    const key = fingerprint(finding)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(finding)
  }
  return out
}

function fingerprint(finding: Diagnostic): string {
  return `${finding.code}|${finding.ref ? `${finding.ref.kind}:${finding.ref.id}` : ''}|${finding.message}`
}
