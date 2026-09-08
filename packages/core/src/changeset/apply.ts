import { deleteEntity } from '../blueprint/delete'
import { findEntity, upsertEntity } from '../blueprint/entities'
import { normalizeBlueprint } from '../blueprint/normalize'
import type { Blueprint } from '../model/types'
import { blueprintHeaderSchema, entitySchemaFor } from '../schema/index'
import type { ChangeOp, ChangeSet } from './types'

export interface ApplyChangeSetOptions {
  /** Op ids to apply. Defaults to every op in the set. */
  accept?: readonly string[]
}

export interface RejectedOp {
  opId: string
  reason: string
}

export interface ApplyChangeSetResult {
  blueprint: Blueprint
  applied: string[]
  rejected: RejectedOp[]
}

function applyOp(bp: Blueprint, op: ChangeOp): Blueprint {
  switch (op.type) {
    case 'create': {
      if (findEntity(bp, op.kind, op.entityId))
        throw new Error(`${op.kind} "${op.entityId}" already exists`)
      const entity = entitySchemaFor(op.kind).parse({ ...op.after, id: op.entityId })
      return upsertEntity(bp, op.kind, entity)
    }
    case 'update': {
      if (!findEntity(bp, op.kind, op.entityId))
        throw new Error(`${op.kind} "${op.entityId}" does not exist`)
      const entity = entitySchemaFor(op.kind).parse({ ...op.after, id: op.entityId })
      return upsertEntity(bp, op.kind, entity)
    }
    case 'delete': {
      if (!findEntity(bp, op.kind, op.entityId))
        throw new Error(`${op.kind} "${op.entityId}" does not exist`)
      return deleteEntity(bp, { kind: op.kind, id: op.entityId }).blueprint
    }
    case 'update-blueprint': {
      const header = blueprintHeaderSchema.parse({
        schemaVersion: bp.schemaVersion,
        id: bp.id,
        name: bp.name,
        version: bp.version,
        ...(bp.description !== undefined ? { description: bp.description } : {}),
        settings: bp.settings,
        targets: bp.targets,
        ...op.after,
      })
      return { ...bp, ...header }
    }
  }
}

/**
 * Apply the accepted ops in order. Ops are independent: one failing op is reported and
 * skipped, the others still apply. The result is normalized.
 */
export function applyChangeSet(
  bp: Blueprint,
  changeSet: ChangeSet,
  options: ApplyChangeSetOptions = {},
): ApplyChangeSetResult {
  const accepted = options.accept === undefined ? undefined : new Set(options.accept)
  let current = bp
  const applied: string[] = []
  const rejected: RejectedOp[] = []

  for (const op of changeSet.ops) {
    if (accepted && !accepted.has(op.id)) continue
    try {
      current = applyOp(current, op)
      applied.push(op.id)
    } catch (error) {
      rejected.push({ opId: op.id, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  return { blueprint: normalizeBlueprint(current), applied, rejected }
}
