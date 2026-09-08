import { getCollection } from '../blueprint/entities'
import { normalizeBlueprint } from '../blueprint/normalize'
import { ENTITY_KINDS } from '../model/kinds'
import type { AnyEntity, Blueprint } from '../model/types'
import { canonicalJson } from '../project/serialize'
import { type BlueprintHeaderFields, type ChangeOp, type ChangeSet, changeOpId } from './types'

function headerFields(bp: Blueprint): BlueprintHeaderFields {
  return {
    name: bp.name,
    version: bp.version,
    ...(bp.description !== undefined ? { description: bp.description } : {}),
    settings: bp.settings,
    targets: bp.targets,
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b)
}

/**
 * Compute the ChangeSet that turns `before` into `after`. Both are normalized first, so
 * cosmetic differences (key order, trailing whitespace) produce no ops. Op ids are
 * deterministic (`create:skill:xunit`), which makes ChangeSets themselves diff-able.
 */
export function diffBlueprints(
  beforeInput: Blueprint,
  afterInput: Blueprint,
  options: { id?: string; summary?: string } = {},
): ChangeSet {
  const before = normalizeBlueprint(beforeInput)
  const after = normalizeBlueprint(afterInput)
  const ops: ChangeOp[] = []

  const beforeHeader = headerFields(before)
  const afterHeader = headerFields(after)
  if (!sameValue(beforeHeader, afterHeader)) {
    const changedBefore: Partial<BlueprintHeaderFields> = {}
    const changedAfter: Partial<BlueprintHeaderFields> = {}
    for (const key of Object.keys({
      ...beforeHeader,
      ...afterHeader,
    }) as (keyof BlueprintHeaderFields)[]) {
      if (sameValue(beforeHeader[key], afterHeader[key])) continue
      Object.assign(changedBefore, { [key]: beforeHeader[key] })
      Object.assign(changedAfter, { [key]: afterHeader[key] })
    }
    const op = { type: 'update-blueprint', before: changedBefore, after: changedAfter } as const
    ops.push({ id: changeOpId(op), ...op })
  }

  for (const kind of ENTITY_KINDS) {
    const beforeById = new Map<string, AnyEntity>(getCollection(before, kind).map((e) => [e.id, e]))
    const afterById = new Map<string, AnyEntity>(getCollection(after, kind).map((e) => [e.id, e]))

    for (const [id, entity] of beforeById) {
      const next = afterById.get(id)
      if (!next) {
        const op = { type: 'delete', kind, entityId: id, before: entity } as const
        ops.push({ id: changeOpId(op), ...op })
      } else if (!sameValue(entity, next)) {
        const op = { type: 'update', kind, entityId: id, before: entity, after: next } as const
        ops.push({ id: changeOpId(op), ...op })
      }
    }
    for (const [id, entity] of afterById) {
      if (beforeById.has(id)) continue
      const op = { type: 'create', kind, entityId: id, after: entity } as const
      ops.push({ id: changeOpId(op), ...op })
    }
  }

  return {
    id: options.id ?? `diff:${before.id}`,
    source: 'diff',
    summary: options.summary ?? `${ops.length} change${ops.length === 1 ? '' : 's'}`,
    ops,
  }
}
