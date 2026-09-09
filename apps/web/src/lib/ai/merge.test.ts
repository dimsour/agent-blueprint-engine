/**
 * Putting a model's findings next to the validator's.
 *
 * The property that matters is the one about the score: a model can add findings and must not
 * move the number, because a score that changes when nothing about the Blueprint did is a
 * score nobody can act on.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import {
  type Diagnostic,
  evaluateBlueprint,
  type EvaluationReport,
  validateBlueprint,
} from '@agent-blueprint/core'
import { portabilityProvider } from '@agent-blueprint/exporters'
import { beforeAll, describe, expect, it } from 'vitest'

import { isAiFinding, withAiFindings, withoutDuplicates } from '@/lib/ai/merge'
import { parseProject } from '@/lib/storage'

let report: EvaluationReport

const contradiction: Diagnostic = {
  code: 'BP-AI-CONTRA-001',
  severity: 'warning',
  message: 'The law forbids what the skill requires.',
  ref: { kind: 'iron-law', id: 'no-implementation-details' },
  data: { source: 'ai' },
}

const gap: Diagnostic = {
  code: 'BP-AI-MISSING-001',
  severity: 'info',
  message: 'No scenario covers the review workflow.',
  ref: { kind: 'workflow', id: 'review-tests' },
  data: { source: 'ai' },
}

beforeAll(async () => {
  const { blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert'))
  report = evaluateBlueprint(blueprint, {
    diagnostics: validateBlueprint(blueprint),
    portability: portabilityProvider(),
  })
})

describe('withAiFindings', () => {
  it('adds the findings without moving a single number', () => {
    const merged = withAiFindings(report, [contradiction, gap])

    expect(merged.overall).toBe(report.overall)
    expect(merged.dimensions.map((dimension) => dimension.score)).toEqual(
      report.dimensions.map((dimension) => dimension.score),
    )
    // The list the score was computed from is untouched, so nothing downstream can mistake a
    // model's finding for an input to the number.
    expect(merged.diagnostics).toEqual(report.diagnostics)
  })

  it('puts each finding beside the dimension it is about', () => {
    const merged = withAiFindings(report, [contradiction, gap])
    const consistency = merged.dimensions.find((dimension) => dimension.id === 'consistency')!
    const coverage = merged.dimensions.find((dimension) => dimension.id === 'coverage')!

    expect(consistency.findings).toContain(contradiction)
    expect(coverage.findings).toContain(gap)
    // Appended, so what cost points is still read first.
    expect(consistency.findings.at(-1)).toBe(contradiction)
  })

  it('changes nothing when the model found nothing', () => {
    expect(withAiFindings(report, [])).toBe(report)
  })

  it('marks what a model produced, and only that', () => {
    expect(isAiFinding(contradiction)).toBe(true)
    expect(isAiFinding(report.diagnostics[0]!)).toBe(false)
  })
})

describe('withoutDuplicates', () => {
  it('drops what the validator already said, and what the model said twice', () => {
    const known = report.diagnostics[0]!
    const echoed: Diagnostic = { ...known, data: { source: 'ai' } }

    const kept = withoutDuplicates(
      [echoed, contradiction, { ...contradiction }],
      report.diagnostics,
    )
    expect(kept).toEqual([contradiction])
  })
})
