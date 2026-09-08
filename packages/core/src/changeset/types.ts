/**
 * A ChangeSet is a reviewable list of proposed edits to a Blueprint. Every AI operation,
 * template application and compound step produces one; the UI shows it as a diff and the
 * user accepts ops individually. Nothing modifies a Blueprint silently.
 */
import type { EntityKind } from '../model/kinds'
import type { AnyEntity, BlueprintHeader } from '../model/types'

export type ChangeSetSource = 'ai' | 'user' | 'template' | 'compound' | 'diff'

export interface CreateOp {
  readonly id: string
  readonly type: 'create'
  readonly kind: EntityKind
  readonly entityId: string
  readonly after: AnyEntity
  readonly note?: string
}

export interface UpdateOp {
  readonly id: string
  readonly type: 'update'
  readonly kind: EntityKind
  readonly entityId: string
  readonly before: AnyEntity
  readonly after: AnyEntity
  readonly note?: string
}

export interface DeleteOp {
  readonly id: string
  readonly type: 'delete'
  readonly kind: EntityKind
  readonly entityId: string
  readonly before: AnyEntity
  readonly note?: string
}

/** Edit to project-level fields: name, description, version, settings, targets. */
export interface UpdateBlueprintOp {
  readonly id: string
  readonly type: 'update-blueprint'
  readonly before: Partial<BlueprintHeaderFields>
  readonly after: Partial<BlueprintHeaderFields>
  readonly note?: string
}

export type BlueprintHeaderFields = Omit<BlueprintHeader, 'schemaVersion' | 'id'>

export type ChangeOp = CreateOp | UpdateOp | DeleteOp | UpdateBlueprintOp

export interface ChangeSet {
  readonly id: string
  readonly source: ChangeSetSource
  readonly summary: string
  readonly ops: readonly ChangeOp[]
}

/** `Omit` that distributes over union members, so the discriminant survives. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export function changeOpId(op: DistributiveOmit<ChangeOp, 'id'>): string {
  return op.type === 'update-blueprint'
    ? 'update-blueprint'
    : `${op.type}:${op.kind}:${op.entityId}`
}
