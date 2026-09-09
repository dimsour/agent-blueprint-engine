/**
 * What changed, field by field, so a proposal can be read rather than trusted.
 *
 * A ChangeSet arrives as whole artifacts: here is the skill before, here is the skill after.
 * That is the right thing to apply and the wrong thing to look at — nobody can spot the one
 * sentence that moved by reading two copies of a page. So this reduces an op to the fields
 * that actually differ and diffs each of them, which is the difference between a review and a
 * rubber stamp.
 *
 * It is deliberately pure and free of React: the rules about which fields matter and how a
 * value is shown are the part worth testing, and the component is then only markup.
 */
import {
  type AnyEntity,
  type ChangeOp,
  ENTITY_KIND_INFO,
  type EntityRef,
  stableJson,
} from '@agent-blueprint/core'
import { diffLines, diffWords } from 'diff'

/** Fields that are identity or bookkeeping: showing them as changes is noise. */
const HIDDEN_FIELDS = new Set(['id', 'metadata'])

/** Above this, a word-level diff is unreadable and line-level is what you want. */
const WORD_DIFF_MAX = 400

export type FieldChange = 'added' | 'removed' | 'changed'

export interface DiffPart {
  text: string
  added?: boolean
  removed?: boolean
}

export interface FieldDiff {
  field: string
  change: FieldChange
  parts: DiffPart[]
}

export interface ReviewOp {
  id: string
  op: ChangeOp
  /** The artifact this lands on, for navigation. Absent for project-level changes. */
  ref?: EntityRef
  /** "New skill", "Skill", "Removed skill", "Project". */
  kindLabel: string
  /** The artifact's name, or its id when it has none. */
  title: string
  fields: FieldDiff[]
}

export function reviewOps(ops: readonly ChangeOp[]): ReviewOp[] {
  return ops.map((op) => {
    if (op.type === 'update-blueprint') {
      return {
        id: op.id,
        op,
        kindLabel: 'Project',
        title: 'Blueprint settings',
        fields: diffRecords(
          op.before as Record<string, unknown>,
          op.after as Record<string, unknown>,
        ),
      }
    }
    const label = ENTITY_KIND_INFO[op.kind].label
    const before = op.type === 'create' ? undefined : (op.before as Record<string, unknown>)
    const after = op.type === 'delete' ? undefined : (op.after as Record<string, unknown>)
    return {
      id: op.id,
      op,
      ref: { kind: op.kind, id: op.entityId },
      kindLabel:
        op.type === 'create' ? `New ${label}` : op.type === 'delete' ? `Removed ${label}` : label,
      title: nameOf(after ?? before) ?? op.entityId,
      fields: diffRecords(before, after),
    }
  })
}

function nameOf(entity: Record<string, unknown> | undefined): string | undefined {
  const name = entity?.['name']
  return typeof name === 'string' && name ? name : undefined
}

/** Every field that differs, in the order the schema lists them. */
export function diffRecords(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): FieldDiff[] {
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  const out: FieldDiff[] = []
  for (const field of fields) {
    if (HIDDEN_FIELDS.has(field)) continue
    const oldValue = before?.[field]
    const newValue = after?.[field]
    if (stableJson(oldValue ?? null) === stableJson(newValue ?? null)) continue
    const oldText = show(oldValue)
    const newText = show(newValue)
    if (!oldText && !newText) continue
    out.push({
      field,
      change: !oldText ? 'added' : !newText ? 'removed' : 'changed',
      parts: diffText(oldText, newText),
    })
  }
  return out
}

/**
 * A value as a human reads it. Lists become lines because that is how a list changes — one
 * item at a time — and a line diff then points at the item rather than at the punctuation
 * around it.
 */
export function show(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) return value.join('\n')
    return value.map((item) => stableJson(item)).join('\n')
  }
  const object = value as Record<string, unknown>
  return Object.entries(object)
    .filter(
      ([, item]) => item !== undefined && stableJson(item) !== '{}' && stableJson(item) !== '[]',
    )
    .map(([key, item]) => `${key}: ${typeof item === 'string' ? item : stableJson(item)}`)
    .join('\n')
}

export function diffText(before: string, after: string): DiffPart[] {
  if (!before) return [{ text: after, added: true }]
  if (!after) return [{ text: before, removed: true }]
  const parts =
    before.length + after.length <= WORD_DIFF_MAX && !before.includes('\n') && !after.includes('\n')
      ? diffWords(before, after)
      : diffLines(before, after)
  return parts.map((part) => ({
    text: part.value,
    ...(part.added ? { added: true } : {}),
    ...(part.removed ? { removed: true } : {}),
  }))
}

/** Replace the artifact an op proposes, keeping the op it belongs to. Used by "Edit". */
export function withEditedEntity(op: ChangeOp, entity: AnyEntity): ChangeOp {
  if (op.type === 'create') return { ...op, after: entity }
  if (op.type === 'update') return { ...op, after: entity }
  return op
}

/** The artifact an op would leave behind, when it leaves one. */
export function proposedEntity(op: ChangeOp): AnyEntity | undefined {
  return op.type === 'create' || op.type === 'update' ? op.after : undefined
}
