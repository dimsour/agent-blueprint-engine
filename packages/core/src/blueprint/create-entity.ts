/**
 * A new, valid artifact of any kind.
 *
 * Every kind has fields the schema will not default: an agent needs a role, an Iron Law
 * needs the law itself. Knowing what the minimum is belongs here rather than in a UI, so the
 * palette, the tree and the wizard all start from the same shape, and so a new artifact is a
 * valid Blueprint member the moment it exists.
 *
 * Text fields that have no sensible neutral value are seeded from the name. That is honest:
 * a Rule called "Prefer composition over inheritance" says the same thing as its guidance
 * until the author writes more, and validation is what tells them to.
 */
import { uniqueSlug } from '../model/ids'
import type { EntityKind } from '../model/kinds'
import type { Blueprint, EntityOf } from '../model/types'
import { entitySchemaFor } from '../schema/index'
import { getCollection } from './entities'

export interface CreateEntityOptions {
  name: string
  /** Explicit slug; derived from the name and made unique when omitted. */
  id?: string
  description?: string
}

/** Fields the schema requires and cannot default, per kind. */
function seedFor(kind: EntityKind, name: string): Record<string, unknown> {
  switch (kind) {
    case 'agent':
      return { role: 'worker' }
    case 'iron-law':
      return { rule: name, category: 'general' }
    case 'rule':
      return { guidance: name }
    case 'hook':
      return { trigger: 'after-file-change', action: { type: 'format' } }
    case 'tool':
      return { kind: 'custom' }
    case 'memory':
      return { scope: 'project' }
    case 'requirement':
      return { statement: name }
    case 'scenario':
      return { input: name }
    case 'workflow':
      // A workflow with no nodes is a structural error, so a new one is the smallest graph
      // that is not: an entry point and a way out. Everything else is added in the editor.
      return {
        entryNodeId: 'start',
        nodes: [
          { id: 'start', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
          { id: 'end', type: 'end', label: 'Done', position: { x: 0, y: 120 } },
        ],
        edges: [{ id: 'e1', from: 'start', to: 'end' }],
      }
    // These kinds are complete with an id and a name; the schema defaults the rest.
    case 'skill':
    case 'gate':
    case 'reference':
      return {}
  }
}

/**
 * Build a new artifact of `kind` that the Blueprint will accept. It is not inserted; pass the
 * result to `upsertEntity`, which is what keeps creation and editing on one code path.
 */
export function createEntity<K extends EntityKind>(
  bp: Blueprint,
  kind: K,
  options: CreateEntityOptions,
): EntityOf<K> {
  const taken = getCollection(bp, kind).map((entity) => entity.id)
  const id = options.id ?? uniqueSlug(options.name, taken, kind)
  return entitySchemaFor(kind).parse({
    ...seedFor(kind, options.name),
    id,
    name: options.name,
    ...(options.description !== undefined ? { description: options.description } : {}),
  }) as EntityOf<K>
}
