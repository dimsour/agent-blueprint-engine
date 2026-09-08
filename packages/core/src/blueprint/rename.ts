import { isSlug } from '../model/ids'
import { ENTITY_KIND_INFO, type EntityKind } from '../model/kinds'
import { visitRefs } from '../model/refs'
import type { Blueprint } from '../model/types'
import { findEntity, getCollection } from './entities'

export class RenameError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'INVALID_SLUG' | 'ID_TAKEN' | 'NO_CHANGE',
  ) {
    super(message)
    this.name = 'RenameError'
  }
}

export interface RenameResult {
  blueprint: Blueprint
  /** Number of reference sites rewritten (not counting the entity itself). */
  updatedRefs: number
}

/**
 * Change an entity's id and rewrite every reference to it. This is the only sanctioned way
 * to change an id: ids are file names and cross-reference keys, so an unmanaged change would
 * silently orphan dependents.
 */
export function renameEntity(
  bp: Blueprint,
  kind: EntityKind,
  oldId: string,
  newId: string,
): RenameResult {
  const label = ENTITY_KIND_INFO[kind].label
  if (!findEntity(bp, kind, oldId)) {
    throw new RenameError(`${label} "${oldId}" does not exist`, 'NOT_FOUND')
  }
  if (!isSlug(newId)) {
    throw new RenameError(`"${newId}" is not a valid slug`, 'INVALID_SLUG')
  }
  if (oldId === newId) {
    throw new RenameError(`${label} is already named "${newId}"`, 'NO_CHANGE')
  }
  if (findEntity(bp, kind, newId)) {
    throw new RenameError(`${label} "${newId}" already exists`, 'ID_TAKEN')
  }

  const next = structuredClone(bp)
  let updatedRefs = 0
  visitRefs(next, (site) => {
    if (site.toKind === kind && site.id === oldId) {
      site.replace(newId)
      updatedRefs += 1
    }
  })
  const entity = getCollection(next, kind).find((item) => item.id === oldId)
  if (entity) entity.id = newId

  return { blueprint: next, updatedRefs }
}
