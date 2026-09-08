import { ENTITY_KIND_INFO, ENTITY_KINDS, type EntityKind } from '../model/kinds'
import type { AnyEntity, Blueprint, EntityInputTypeMap, EntityOf, EntityRef } from '../model/types'
import { entitySchemaFor } from '../schema/index'

/** The array holding entities of `kind`. */
export function getCollection<K extends EntityKind>(bp: Blueprint, kind: K): EntityOf<K>[] {
  return bp[ENTITY_KIND_INFO[kind].collection] as unknown as EntityOf<K>[]
}

export function findEntity<K extends EntityKind>(
  bp: Blueprint,
  kind: K,
  id: string,
): EntityOf<K> | undefined {
  return getCollection(bp, kind).find((entity) => entity.id === id)
}

export function hasEntity(bp: Blueprint, ref: EntityRef): boolean {
  return findEntity(bp, ref.kind, ref.id) !== undefined
}

/** Every entity in the Blueprint as a reference, in collection order. */
export function listEntityRefs(bp: Blueprint): EntityRef[] {
  const refs: EntityRef[] = []
  for (const kind of ENTITY_KINDS) {
    for (const entity of getCollection(bp, kind)) refs.push({ kind, id: entity.id })
  }
  return refs
}

export function countEntities(bp: Blueprint): number {
  return ENTITY_KINDS.reduce((total, kind) => total + getCollection(bp, kind).length, 0)
}

/** Lookup structure: kind → id → entity. */
export type EntityIndex = ReadonlyMap<EntityKind, ReadonlyMap<string, AnyEntity>>

export function buildEntityIndex(bp: Blueprint): EntityIndex {
  const index = new Map<EntityKind, Map<string, AnyEntity>>()
  for (const kind of ENTITY_KINDS) {
    const byId = new Map<string, AnyEntity>()
    for (const entity of getCollection(bp, kind)) byId.set(entity.id, entity)
    index.set(kind, byId)
  }
  return index
}

function withCollection<K extends EntityKind>(
  bp: Blueprint,
  kind: K,
  update: (items: EntityOf<K>[]) => EntityOf<K>[],
): Blueprint {
  const key = ENTITY_KIND_INFO[kind].collection
  return { ...bp, [key]: update(getCollection(bp, kind)) }
}

/**
 * Insert or replace an entity. The input is validated and normalized through its schema.
 * Returns a new Blueprint; the input Blueprint is not mutated.
 */
export function upsertEntity<K extends EntityKind>(
  bp: Blueprint,
  kind: K,
  input: EntityInputTypeMap[K],
): Blueprint {
  const entity = entitySchemaFor(kind).parse(input) as EntityOf<K>
  return withCollection(bp, kind, (items) => {
    const index = items.findIndex((item) => item.id === entity.id)
    if (index === -1) return [...items, entity]
    return items.map((item, i) => (i === index ? entity : item))
  })
}

/**
 * Remove an entity without touching references to it. Prefer `deleteEntity`, which also
 * cleans up references and reports the impact.
 */
export function removeEntityRaw(bp: Blueprint, ref: EntityRef): Blueprint {
  return withCollection(bp, ref.kind, (items) => items.filter((item) => item.id !== ref.id))
}
