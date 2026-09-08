import { visitRefs } from '../model/refs'
import type { Blueprint, EntityRef } from '../model/types'
import { buildDependencyGraph, impactOf, type ImpactReport } from '../dependencies/graph'
import { hasEntity, removeEntityRaw } from './entities'

export interface DeleteResult {
  blueprint: Blueprint
  /** What depended on the deleted entity, computed before deletion. */
  impact: ImpactReport
  /** Number of references removed from other entities. */
  removedRefs: number
}

/**
 * Delete an entity and remove every reference to it. Callers should show `impactOf` to the
 * user *before* calling this; the returned impact is the same report for convenience.
 */
export function deleteEntity(bp: Blueprint, ref: EntityRef): DeleteResult {
  if (!hasEntity(bp, ref)) {
    throw new Error(`${ref.kind} "${ref.id}" does not exist`)
  }
  const impact = impactOf(buildDependencyGraph(bp), ref)

  const next = structuredClone(removeEntityRaw(bp, ref))
  let removedRefs = 0
  visitRefs(next, (site) => {
    if (site.toKind === ref.kind && site.id === ref.id) {
      site.replace(null)
      removedRefs += 1
    }
  })
  return { blueprint: next, impact, removedRefs }
}
