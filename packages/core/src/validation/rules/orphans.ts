/**
 * Orphan rules: artifacts nothing points at.
 *
 * An orphan is not broken, but it is dead weight: it will never reach a harness, and it
 * usually means either a missing connection or a leftover. One code per kind so the UI can
 * group them and so a user can silence one kind without silencing the rest.
 */
import { ENTITY_KIND_INFO, type EntityKind } from '../../model/kinds'
import { findOrphans } from '../../dependencies/graph'
import type { ValidationRule } from '../engine'
import type { Diagnostic } from '../types'

/** Stable code per kind, so a code always means the same thing. */
export const ORPHAN_CODES: Partial<Record<EntityKind, string>> = {
  skill: 'BP-ORPHAN-001',
  workflow: 'BP-ORPHAN-002',
  'iron-law': 'BP-ORPHAN-003',
  rule: 'BP-ORPHAN-004',
  gate: 'BP-ORPHAN-005',
  tool: 'BP-ORPHAN-006',
  reference: 'BP-ORPHAN-007',
  memory: 'BP-ORPHAN-008',
}

const ADVICE: Partial<Record<EntityKind, string>> = {
  skill: 'attach it to an agent or a workflow step',
  workflow: 'attach it to an agent or give it trigger intents',
  'iron-law': 'set its scope to all agents or list the agents it binds',
  rule: 'set its scope to all agents or list the agents it guides',
  gate: 'use it as a gate step in a workflow',
  tool: 'give it to an agent or allow it in a skill',
  reference: 'attach it to the skill or agent that needs it',
  memory: 'attach it to the agent that should remember it',
}

export const orphanedArtifacts: ValidationRule = {
  code: 'BP-ORPHAN-001',
  description:
    'Artifacts nothing uses are never compiled into a harness; a law or rule is used by its own scope.',
  check({ graph, blueprint }) {
    const out: Diagnostic[] = []
    for (const ref of findOrphans(graph, blueprint)) {
      const code = ORPHAN_CODES[ref.kind]
      if (code === undefined) continue
      const label = ENTITY_KIND_INFO[ref.kind].label.toLowerCase()
      out.push({
        code,
        severity: 'warning',
        message: `Nothing uses the ${label} "${ref.id}"; ${ADVICE[ref.kind] ?? 'connect it to something'} or delete it.`,
        ref,
      })
    }
    return out
  },
}

export const ORPHAN_RULES: readonly ValidationRule[] = [orphanedArtifacts]
