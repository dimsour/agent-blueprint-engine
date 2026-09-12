/**
 * The findings about an artifact, by the field they are about (P9-20).
 *
 * A finding is filed against an artifact and listed in three places, and none of them is the
 * form. Reported from use, after P9-19 put a pointer on the finding: "is it possible to also
 * add indications and hints near the actual fields that need fixing?" It is, because the
 * catalogue now says which fields each code is about, and a near miss says which field on
 * the other artifact fell short.
 *
 * Two sources, one shape:
 *
 * - A finding **on** this artifact marks each field its code names. The text is the finding's
 *   own message.
 * - A finding **elsewhere** that names this artifact as a near miss marks the field the near
 *   miss recorded, with its clause as the text and a way back to the finding's artifact —
 *   because "its action is command, not secret-scan" beside the action select is the fix, and
 *   "from Requirement: security-enforcement" beside it is why.
 *
 * Pure over the diagnostics the store already holds. No new computation on edit.
 */
import { type Diagnostic, diagnosticCode, type EntityRef, refKey } from '@agent-blueprint/core'

export interface FieldHint {
  code: string
  severity: Diagnostic['severity']
  /** What is wrong with this field, in the finding's words. */
  text: string
  /** The artifact the finding is filed against, when it is not this one. */
  from?: EntityRef
}

interface NearMissData {
  kind: EntityRef['kind']
  id: string
  because: string
  field?: string
}

function nearMissesIn(diagnostic: Diagnostic): NearMissData[] {
  const raw: unknown = diagnostic.data?.['nearMisses']
  if (!Array.isArray(raw)) return []
  const out: NearMissData[] = []
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const { kind, id, because, field } = entry as Record<string, unknown>
    if (typeof kind !== 'string' || typeof id !== 'string' || typeof because !== 'string') continue
    out.push({
      kind: kind as EntityRef['kind'],
      id,
      because,
      ...(typeof field === 'string' ? { field } : {}),
    })
  }
  return out
}

/** Every field hint for `ref`, keyed by field path — `description`, `action.type`, … */
export function fieldFindingsFor(
  diagnostics: readonly Diagnostic[],
  ref: EntityRef,
): Map<string, FieldHint[]> {
  const key = refKey(ref)
  const hints = new Map<string, FieldHint[]>()
  const add = (field: string, hint: FieldHint) => {
    const list = hints.get(field) ?? []
    list.push(hint)
    hints.set(field, list)
  }

  for (const diagnostic of diagnostics) {
    if (diagnostic.ref && refKey(diagnostic.ref) === key) {
      for (const field of diagnosticCode(diagnostic.code)?.fields ?? []) {
        add(field, {
          code: diagnostic.code,
          severity: diagnostic.severity,
          text: diagnostic.message,
        })
      }
      continue
    }

    for (const miss of nearMissesIn(diagnostic)) {
      if (miss.field === undefined || refKey({ kind: miss.kind, id: miss.id }) !== key) continue
      add(miss.field, {
        code: diagnostic.code,
        severity: diagnostic.severity,
        text: miss.because,
        ...(diagnostic.ref ? { from: diagnostic.ref } : {}),
      })
    }
  }
  return hints
}

/** The hints for one field, or none — the shape a form spreads onto a `Field`. */
export function hintsFor(
  hints: ReadonlyMap<string, FieldHint[]>,
  field: string,
): { hints?: FieldHint[] } {
  const found = hints.get(field)
  return found && found.length > 0 ? { hints: found } : {}
}
