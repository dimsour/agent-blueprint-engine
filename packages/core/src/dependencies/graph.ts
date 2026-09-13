/**
 * Dependency graph derived from the Blueprint's typed references.
 *
 * Nodes are entities; an edge A → B means "A depends on B" (A references B). The graph is
 * recomputed from the Blueprint whenever needed — it is never stored.
 */
import { ENTITY_KINDS, type EntityKind } from '../model/kinds'
import { collectRefs, isEntitySource, type RefRelation } from '../model/refs'
import { type Blueprint, type EntityRef, refKey } from '../model/types'
import { getCollection } from '../blueprint/entities'

export interface DependencyEdge {
  readonly from: EntityRef
  readonly to: EntityRef
  readonly relation: RefRelation
}

export interface DependencyGraph {
  readonly nodes: readonly EntityRef[]
  readonly edges: readonly DependencyEdge[]
  /** Entities that `ref` depends on. */
  dependenciesOf(ref: EntityRef): DependencyEdge[]
  /** Entities that depend on `ref`. */
  dependentsOf(ref: EntityRef): DependencyEdge[]
  /** References whose target does not exist. */
  readonly dangling: readonly DependencyEdge[]
  /** Blueprint-level references (currently only the primary agent). */
  readonly primaryAgentId: string | undefined
  has(ref: EntityRef): boolean
}

export function buildDependencyGraph(bp: Blueprint): DependencyGraph {
  const nodes: EntityRef[] = []
  const known = new Set<string>()
  for (const kind of ENTITY_KINDS) {
    for (const entity of getCollection(bp, kind)) {
      const ref = { kind, id: entity.id }
      nodes.push(ref)
      known.add(refKey(ref))
    }
  }

  const edges: DependencyEdge[] = []
  const dangling: DependencyEdge[] = []
  const outgoing = new Map<string, DependencyEdge[]>()
  const incoming = new Map<string, DependencyEdge[]>()
  let primaryAgentId: string | undefined

  for (const ref of collectRefs(bp)) {
    if (!isEntitySource(ref.from)) {
      if (ref.relation === 'primary-agent') primaryAgentId = ref.to.id
      if (!known.has(refKey(ref.to))) {
        dangling.push({ from: { kind: 'agent', id: '' }, to: ref.to, relation: ref.relation })
      }
      continue
    }
    const edge: DependencyEdge = { from: ref.from, to: ref.to, relation: ref.relation }
    if (!known.has(refKey(ref.to))) {
      dangling.push(edge)
      continue
    }
    edges.push(edge)
    push(outgoing, refKey(edge.from), edge)
    push(incoming, refKey(edge.to), edge)
  }

  return {
    nodes,
    edges,
    dangling,
    primaryAgentId,
    dependenciesOf: (ref) => outgoing.get(refKey(ref)) ?? [],
    dependentsOf: (ref) => incoming.get(refKey(ref)) ?? [],
    has: (ref) => known.has(refKey(ref)),
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export interface ImpactReport {
  readonly target: EntityRef
  /** Entities that directly reference the target. */
  readonly direct: readonly EntityRef[]
  /** Entities reachable by following dependents transitively (includes `direct`). */
  readonly transitive: readonly EntityRef[]
  /** Whether the target is the Blueprint's primary agent. */
  readonly isPrimaryAgent: boolean
}

/** What would be affected if `ref` were deleted or changed. */
export function impactOf(graph: DependencyGraph, ref: EntityRef): ImpactReport {
  const direct = uniqueRefs(graph.dependentsOf(ref).map((edge) => edge.from))
  const transitive: EntityRef[] = []
  const seen = new Set<string>([refKey(ref)])
  const queue = [...direct]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    const key = refKey(current)
    if (seen.has(key)) continue
    seen.add(key)
    transitive.push(current)
    for (const edge of graph.dependentsOf(current)) queue.push(edge.from)
  }
  return {
    target: ref,
    direct,
    transitive,
    isPrimaryAgent: ref.kind === 'agent' && graph.primaryAgentId === ref.id,
  }
}

/** Kinds that are expected to be referenced by something; unreferenced ones are orphans. */
export const ORPHANABLE_KINDS: readonly EntityKind[] = [
  'skill',
  'workflow',
  'iron-law',
  'rule',
  'gate',
  'tool',
  'reference',
  'memory',
]

/**
 * Entities nothing uses. Agents are roots and are never orphans here (an agent without a
 * workflow is a semantic validation rule); hooks, requirements and scenarios are global by
 * nature.
 *
 * "Uses" means what the compiler means. A skill, gate or tool is used when something points
 * at it. An Iron Law or a rule is different: its own `scope` is what the compiler reads to
 * decide whose instructions it goes into — every agent's when `scope.all`, the named ones
 * otherwise — and an agent's `ironLawIds` is not consulted (`lawsForAgent`). So a law nothing
 * lists but that applies to everything is in every compiled file, and calling it an orphan
 * sent people to "set its scope to all agents", which was already true and changed nothing
 * (P9-40). A law is an orphan only when its scope reaches nothing *and* no agent lists it —
 * which is also when `BP-LAW-001` says it applies to nothing.
 */
export function findOrphans(graph: DependencyGraph, blueprint: Blueprint): EntityRef[] {
  return graph.nodes.filter((ref) => {
    if (!ORPHANABLE_KINDS.includes(ref.kind)) return false
    if (graph.dependentsOf(ref).length > 0) return false
    if (ref.kind !== 'iron-law' && ref.kind !== 'rule') return true
    const scoped = getCollection(blueprint, ref.kind).find((entity) => entity.id === ref.id)
    if (!scoped) return true
    const { scope } = scoped as { scope: Blueprint['ironLaws'][number]['scope'] }
    if (scope.all) return false
    // A scope naming an agent or a workflow is an outgoing edge; one that resolved is a use.
    return !graph
      .dependenciesOf(ref)
      .some((edge) => edge.relation === 'scoped-to-agent' || edge.relation === 'scoped-to-workflow')
  })
}

function uniqueRefs(refs: EntityRef[]): EntityRef[] {
  const seen = new Set<string>()
  const out: EntityRef[] = []
  for (const ref of refs) {
    const key = refKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}
