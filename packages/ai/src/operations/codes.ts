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
  /**
   * How it is cleared. The same field the core catalogue carries, for the same two uses: the
   * "How to fix" note a person reads, and the steering a fix operation is given. A finding
   * from a model is still a finding, and it needs both.
   */
  remedy: string
}

export const AI_DIAGNOSTIC_CODES: readonly AIDiagnosticCode[] = [
  {
    code: 'BP-AI-CONTRA-001',
    severity: 'warning',
    summary: 'A model found two instructions that cannot both be followed.',
    remedy:
      'Read both artifacts — the finding names them — and change one, or scope them so they never apply at once. A model raised this, so check that they really do conflict before rewriting either.',
  },
  {
    code: 'BP-AI-MISSING-001',
    severity: 'varies',
    summary: 'A model found something the Blueprint implies but does not specify.',
    remedy:
      'Write the artifact the gap calls for, or decide the gap is deliberate and leave it. A model raised this, so it is a suggestion rather than a rule the Blueprint has broken.',
  },
  {
    code: 'BP-AI-REQ-001',
    severity: 'varies',
    summary: 'A model judged an `ai-judged` requirement check as failing or unclear.',
    remedy:
      'The rationale says what the model looked for and did not find. Either build what the requirement asks for, or reword the check so it describes what the Blueprint actually promises.',
  },
]

const AI_BY_CODE = new Map(AI_DIAGNOSTIC_CODES.map((entry) => [entry.code, entry]))

export function aiDiagnosticCode(code: string): AIDiagnosticCode | undefined {
  return AI_BY_CODE.get(code)
}

export const AI_CONTRADICTION_CODE = 'BP-AI-CONTRA-001'
export const AI_MISSING_CODE = 'BP-AI-MISSING-001'
export const AI_REQUIREMENT_CODE = 'BP-AI-REQ-001'

/** Severity for a finding, mapped from what the model claimed. */
export function severityFor(claimed: 'critical' | 'high' | 'medium' | 'low'): DiagnosticSeverity {
  if (claimed === 'critical' || claimed === 'high') return 'warning'
  return 'info'
}
