/**
 * Turning what a model said into something the user can accept or reject.
 *
 * This is the gate between an answer and a Blueprint, and everything it does is defensive.
 * Each artifact is parsed by the real core schema; one that will not parse is dropped with a
 * note rather than allowed to fail the whole answer. Ids are slugified and made unique, and
 * every reference the model wrote is either resolved to an artifact that will exist or
 * removed — a Blueprint with a dangling reference is a Blueprint that will not compile, and
 * the model has no way to know which of its own ids survived collision.
 *
 * Nothing here applies anything. The result is a ChangeSet: a proposal the user reviews op by
 * op, which is the rule the whole product rests on (AGENTS.md rule 6).
 */
import {
  type AnyEntity,
  type Blueprint,
  type BlueprintHeaderFields,
  type ChangeOp,
  type ChangeSet,
  type ChangeSetSource,
  changeOpId,
  type EntityKind,
  entitySchemaFor,
  findEntity,
  getCollection,
  PERMISSION_OPERATIONS,
  slugify,
  stableJson,
  uniqueSlug,
  upsertEntity,
  visitRefs,
} from '@agent-blueprint/core'

import { aiEntitySchemaFor } from '../schemas/entities'
import { layoutWorkflowNodes } from './layout'

/** One artifact as the model wrote it, before anything has been checked. */
export interface Draft {
  kind: EntityKind
  value: unknown
  /** Why the model proposed it; carried onto the op so the reviewer sees the reasoning. */
  note?: string
}

export interface AssembleOptions {
  blueprint: Blueprint
  source: ChangeSetSource
  /** Stable id for the ChangeSet — the operation that produced it. Never random. */
  id: string
  summary: string
  drafts: readonly Draft[]
  /** Project-level fields to change: name, description, settings, targets. */
  header?: Partial<BlueprintHeaderFields>
  /**
   * An agent to wire what was created into. Attachment is computed here rather than asked
   * for, because the model cannot know the id an artifact ended up with.
   */
  attachToAgentId?: string
}

export interface Assembly {
  changeSet: ChangeSet
  /** What was dropped, renamed or unwired on the way in. Shown with the review. */
  notes: string[]
}

/** Which list on an agent holds each kind. Kinds absent here are not attached to anything. */
const AGENT_FIELD_FOR_KIND: Partial<Record<EntityKind, keyof AgentLists>> = {
  skill: 'skillIds',
  workflow: 'workflowIds',
  'iron-law': 'ironLawIds',
  rule: 'ruleIds',
  tool: 'toolIds',
  reference: 'referenceIds',
  memory: 'memoryIds',
}

interface AgentLists {
  skillIds: string[]
  workflowIds: string[]
  ironLawIds: string[]
  ruleIds: string[]
  toolIds: string[]
  referenceIds: string[]
  memoryIds: string[]
}

interface Accepted {
  kind: EntityKind
  /** The id the artifact will have, which is not always the one the model wrote. */
  id: string
  entity: AnyEntity
  note?: string
}

export function assembleChangeSet(options: AssembleOptions): Assembly {
  const notes: string[] = []
  const { blueprint } = options

  const taken = new Map<EntityKind, Set<string>>()
  const idFor = (kind: EntityKind): Set<string> => {
    let set = taken.get(kind)
    if (!set) {
      set = new Set(getCollection(blueprint, kind).map((entity) => entity.id))
      taken.set(kind, set)
    }
    return set
  }

  /** Artifacts that could not keep the id the model gave them. */
  const collided: { kind: EntityKind; wanted: string; id: string }[] = []
  const accepted: Accepted[] = []

  for (const draft of options.drafts) {
    const prepared = prepare(draft.kind, draft.value, notes)
    const parsed = aiEntitySchemaFor(draft.kind).safeParse(prepared)
    if (!parsed.success) {
      notes.push(
        `Dropped a proposed ${draft.kind}: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
          .join('; ')}`,
      )
      continue
    }

    const fields = parsed.data as Record<string, unknown>
    const wanted = typeof fields.id === 'string' ? fields.id : ''
    const ids = idFor(draft.kind)
    const existing = findEntity(blueprint, draft.kind, wanted)
    const id = existing
      ? wanted
      : uniqueSlug(wanted || (typeof fields.name === 'string' ? fields.name : ''), ids, draft.kind)
    if (!existing) {
      ids.add(id)
      if (id !== wanted) collided.push({ kind: draft.kind, wanted, id })
    }

    const complete = entitySchemaFor(draft.kind).safeParse({
      ...fields,
      id,
      // Unknown keys the project reader preserved belong to the file, not to the model.
      metadata: (existing as { metadata?: unknown } | undefined)?.metadata ?? {},
      ...(draft.kind === 'workflow' ? { nodes: positioned(fields) } : {}),
    })
    if (!complete.success) {
      notes.push(
        `Dropped a proposed ${draft.kind}: ${complete.error.issues[0]?.message ?? 'invalid'}`,
      )
      continue
    }
    accepted.push({
      kind: draft.kind,
      id,
      entity: complete.data,
      ...(draft.note !== undefined ? { note: draft.note } : {}),
    })
  }

  // A tentative Blueprint is the only place references can be checked: an artifact may point
  // at another one in the same answer, which does not exist anywhere else yet.
  let tentative = blueprint
  for (const entry of accepted) tentative = upsertEntity(tentative, entry.kind, entry.entity)

  /**
   * Where an artifact had to be renamed, references to the id the model used follow it — but
   * only when nothing else ended up with that id. A model that writes two skills called
   * `xunit` means the first one when it says `xunit`, not the one that got pushed to
   * `xunit-2`, and remapping there would silently rewire the answer.
   */
  const renames = new Map<string, string>()
  for (const entry of collided) {
    if (findEntity(tentative, entry.kind, entry.wanted) === undefined) {
      renames.set(`${entry.kind}:${entry.wanted}`, entry.id)
    }
  }

  const ours = new Set(accepted.map((entry) => `${entry.kind}:${entry.id}`))
  const dropped = new Set<string>()
  visitRefs(tentative, (site) => {
    if (site.from.kind === 'blueprint' || !ours.has(`${site.from.kind}:${site.from.id}`)) return
    const renamed = renames.get(`${site.toKind}:${site.id}`)
    if (renamed !== undefined) {
      site.replace(renamed)
      return
    }
    if (findEntity(tentative, site.toKind, site.id) === undefined) {
      dropped.add(`${site.toKind}:${site.id}`)
      site.replace(null)
    }
  })
  for (const ref of [...dropped].sort()) {
    notes.push(`Removed a reference to ${ref}, which does not exist.`)
  }

  const attachment = attach(tentative, options.attachToAgentId, accepted)
  if (attachment) tentative = attachment

  const ops: ChangeOp[] = []
  const header = headerOp(blueprint, tentative, options.header, notes)
  if (header) ops.push(header)

  for (const entry of accepted) {
    const op = opFor(blueprint, tentative, entry.kind, entry.id, entry.note)
    if (op) ops.push(op)
  }
  if (options.attachToAgentId) {
    const op = opFor(blueprint, tentative, 'agent', options.attachToAgentId, 'Wired up.')
    if (op) ops.push(op)
  }

  return {
    changeSet: { id: options.id, source: options.source, summary: options.summary, ops },
    notes,
  }
}

/**
 * Fill in what a model reliably leaves out. An artifact with a name and no id, or a workflow
 * whose edges have no ids, is a well-formed proposal expressed sloppily; rejecting it would
 * cost a round trip to be told something we can work out.
 */
function prepare(kind: EntityKind, value: unknown, notes: string[]): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const source = { ...(value as Record<string, unknown>) }
  if (typeof source.id !== 'string' || source.id === '') {
    const name = typeof source.name === 'string' ? source.name : ''
    if (name) source.id = slugify(name)
  }
  if (kind === 'agent') source.permissions = prunePermissions(source.permissions, notes)
  if (kind !== 'workflow') return source

  const nodes: unknown[] = Array.isArray(source.nodes) ? (source.nodes as unknown[]) : []
  source.nodes = nodes.map((node, index) => {
    if (node === null || typeof node !== 'object') return node
    const step = { ...(node as Record<string, unknown>) }
    if (typeof step.id !== 'string' || step.id === '') {
      const label = typeof step.label === 'string' ? step.label : ''
      step.id = slugify(label) || `step-${index + 1}`
    }
    return step
  })
  const edges: unknown[] = Array.isArray(source.edges) ? (source.edges as unknown[]) : []
  source.edges = edges.map((edge, index) => {
    if (edge === null || typeof edge !== 'object') return edge
    const link = { ...(edge as Record<string, unknown>) }
    if (typeof link.id !== 'string' || link.id === '') link.id = `e${index + 1}`
    return link
  })
  if (typeof source.entryNodeId !== 'string') {
    const first = (source.nodes as Record<string, unknown>[]).find((node) => node.type === 'start')
    if (first) source.entryNodeId = first.id
  }
  return source
}

/**
 * Remove permission operations that do not exist, and keep the agent.
 *
 * `permissions.operations` is a map keyed by a closed enum, so one invented key fails the whole
 * artifact — and an agent is the one artifact nothing survives losing. A live model asked for
 * `git.fetch` and `git.checkout`, which are not in `PERMISSION_OPERATIONS`; the agent was
 * dropped, the workflow's reference to it was then removed as dangling, the primary agent was
 * ignored for not existing, and the draft arrived as fifteen changes describing a system with
 * nobody in it.
 *
 * Dropping the key it could not express is the same repair the assembler already makes for a
 * reference that points at nothing, and for the same reason: the model's intent for the rest of
 * the artifact is perfectly clear. What was dropped goes in the notes, so the review says it.
 */
function prunePermissions(value: unknown, notes: string[]): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const permissions = { ...(value as Record<string, unknown>) }
  const known = new Set<string>(PERMISSION_OPERATIONS)
  const unknown: string[] = []

  const operations = permissions.operations
  if (operations !== null && typeof operations === 'object' && !Array.isArray(operations)) {
    const kept: Record<string, unknown> = {}
    for (const [operation, decision] of Object.entries(operations as Record<string, unknown>)) {
      if (known.has(operation)) kept[operation] = decision
      else unknown.push(operation)
    }
    permissions.operations = kept
  }

  if (Array.isArray(permissions.patterns)) {
    permissions.patterns = (permissions.patterns as unknown[]).filter((pattern) => {
      const operation = (pattern as { operation?: unknown } | null)?.operation
      if (typeof operation !== 'string' || known.has(operation)) return true
      unknown.push(operation)
      return false
    })
  }

  for (const operation of [...new Set(unknown)].sort()) {
    notes.push(`Removed the permission "${operation}", which is not an operation this model has.`)
  }
  return permissions
}

function positioned(fields: Record<string, unknown>): unknown {
  const nodes: unknown[] = Array.isArray(fields.nodes) ? (fields.nodes as unknown[]) : []
  const edges: unknown[] = Array.isArray(fields.edges) ? (fields.edges as unknown[]) : []
  return layoutWorkflowNodes(
    nodes as Parameters<typeof layoutWorkflowNodes>[0],
    edges as Parameters<typeof layoutWorkflowNodes>[1],
    typeof fields.entryNodeId === 'string' ? fields.entryNodeId : undefined,
  )
}

/** Add what was created to the agent that will use it, without disturbing what it already has. */
function attach(
  tentative: Blueprint,
  agentId: string | undefined,
  accepted: readonly Accepted[],
): Blueprint | undefined {
  if (!agentId) return undefined
  const agent = findEntity(tentative, 'agent', agentId)
  if (!agent) return undefined

  const lists: Partial<AgentLists> = {}
  for (const entry of accepted) {
    const field = AGENT_FIELD_FOR_KIND[entry.kind]
    if (!field) continue
    const current = lists[field] ?? [...(agent as unknown as AgentLists)[field]]
    if (!current.includes(entry.id)) current.push(entry.id)
    lists[field] = current
  }
  if (Object.keys(lists).length === 0) return undefined
  return upsertEntity(tentative, 'agent', { ...agent, ...lists })
}

function opFor(
  before: Blueprint,
  after: Blueprint,
  kind: EntityKind,
  id: string,
  note: string | undefined,
): ChangeOp | undefined {
  const next = findEntity(after, kind, id)
  if (!next) return undefined
  const previous = findEntity(before, kind, id)
  if (previous && stableJson(previous) === stableJson(next)) return undefined
  const body = previous
    ? ({ type: 'update', kind, entityId: id, before: previous, after: next } as const)
    : ({ type: 'create', kind, entityId: id, after: next } as const)
  return { id: changeOpId(body), ...body, ...(note !== undefined ? { note } : {}) }
}

/** Project-level changes, with the primary agent checked against what will actually exist. */
function headerOp(
  blueprint: Blueprint,
  tentative: Blueprint,
  header: Partial<BlueprintHeaderFields> | undefined,
  notes: string[],
): ChangeOp | undefined {
  if (!header) return undefined
  const after: Partial<BlueprintHeaderFields> = {}
  const before: Partial<BlueprintHeaderFields> = {}

  if (header.name !== undefined && header.name !== blueprint.name) {
    before.name = blueprint.name
    after.name = header.name
  }
  if (header.description !== undefined && header.description !== blueprint.description) {
    if (blueprint.description !== undefined) before.description = blueprint.description
    after.description = header.description
  }
  if (header.settings?.primaryAgentId !== undefined) {
    const id = header.settings.primaryAgentId
    if (findEntity(tentative, 'agent', id) === undefined) {
      notes.push(`Ignored "${id}" as the primary agent: there is no such agent.`)
    } else if (id !== blueprint.settings.primaryAgentId) {
      before.settings = blueprint.settings
      after.settings = { ...blueprint.settings, primaryAgentId: id }
    }
  }
  if (Object.keys(after).length === 0) return undefined
  return {
    id: changeOpId({ type: 'update-blueprint', before, after }),
    type: 'update-blueprint',
    before,
    after,
  }
}
