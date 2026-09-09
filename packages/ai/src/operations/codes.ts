/**
 * Diagnostic codes the AI layer emits.
 *
 * They are kept apart from the core catalogue on purpose: core is deterministic and these are
 * not, and a user looking at a finding is entitled to know which kind they are reading. Every
 * one of them carries `data.source: 'ai'` for the same reason — the UI marks them, and a
 * filter can remove them.
 *
 * Codes are promises: `BP-AI-CONTRA-001` will always mean "two instructions conflict". They
 * are documented in docs/05-validation-evaluation.md alongside the deterministic ones.
 */
import type { DiagnosticSeverity } from '@agent-blueprint/core'

export interface AIDiagnosticCode {
  code: string
  severity: DiagnosticSeverity | 'varies'
  summary: string
}

export const AI_DIAGNOSTIC_CODES: readonly AIDiagnosticCode[] = [
  {
    code: 'BP-AI-CONTRA-001',
    severity: 'warning',
    summary: 'A model found two instructions that cannot both be followed.',
  },
  {
    code: 'BP-AI-MISSING-001',
    severity: 'varies',
    summary: 'A model found something the Blueprint implies but does not specify.',
  },
  {
    code: 'BP-AI-REQ-001',
    severity: 'varies',
    summary: 'A model judged an `ai-judged` requirement check as failing or unclear.',
  },
]

export const AI_CONTRADICTION_CODE = 'BP-AI-CONTRA-001'
export const AI_MISSING_CODE = 'BP-AI-MISSING-001'
export const AI_REQUIREMENT_CODE = 'BP-AI-REQ-001'

/** Severity for a finding, mapped from what the model claimed. */
export function severityFor(claimed: 'critical' | 'high' | 'medium' | 'low'): DiagnosticSeverity {
  if (claimed === 'critical' || claimed === 'high') return 'warning'
  return 'info'
}
