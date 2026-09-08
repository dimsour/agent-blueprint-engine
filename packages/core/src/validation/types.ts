import type { JsonObject } from '../model/json'
import type { EntityRef } from '../model/types'

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

/**
 * One finding about a Blueprint. `code` is stable and documented in
 * docs/05-validation-evaluation.md; `ref` lets the UI navigate to the artifact.
 */
export interface Diagnostic {
  readonly code: string
  readonly severity: DiagnosticSeverity
  readonly message: string
  /** The artifact the finding is about, when there is one. */
  readonly ref?: EntityRef
  /** Other artifacts involved (e.g. both sides of a contradiction). */
  readonly related?: readonly EntityRef[]
  /** File path, when the finding comes from reading a project. */
  readonly path?: string
  /** Rule-specific structured details for the UI (never required to render the message). */
  readonly data?: JsonObject
}

export interface DiagnosticSummary {
  errors: number
  warnings: number
  infos: number
}

export function summarizeDiagnostics(diagnostics: readonly Diagnostic[]): DiagnosticSummary {
  const summary: DiagnosticSummary = { errors: 0, warnings: 0, infos: 0 }
  for (const d of diagnostics) {
    if (d.severity === 'error') summary.errors += 1
    else if (d.severity === 'warning') summary.warnings += 1
    else summary.infos += 1
  }
  return summary
}

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 }

/** Stable order: severity, then code, then artifact, then message. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    if (a.code !== b.code) return a.code < b.code ? -1 : 1
    const refA = a.ref ? `${a.ref.kind}:${a.ref.id}` : ''
    const refB = b.ref ? `${b.ref.kind}:${b.ref.id}` : ''
    if (refA !== refB) return refA < refB ? -1 : 1
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0
  })
}
