/**
 * The Blueprint as a graph.
 *
 * Everything here is derived: the nodes are the artifacts, the edges are the typed
 * references `collectRefs` already walks, and nothing is stored. That is the point of the
 * overview. A Blueprint's shape is a fact about its contents, so a position saved in a file
 * would only ever be a second opinion about it.
 */
import {
  type Blueprint,
  buildDependencyGraph,
  type Diagnostic,
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityKind,
  type EntityRef,
  findEntity,
  findOrphans,
  getCollection,
  refKey,
} from '@agent-blueprint/core'

/**
 * A hue per kind, so the twelve kinds are told apart without twelve new design tokens.
 * Spread around the wheel in the order the model lists them, which keeps neighbouring kinds
 * distinguishable and makes the mapping something you can predict rather than look up.
 */
export const KIND_HUE: Record<EntityKind, number> = {
  agent: 264,
  skill: 200,
  workflow: 170,
  'iron-law': 25,
  rule: 45,
  hook: 320,
  gate: 0,
  tool: 140,
  reference: 230,
  memory: 290,
  requirement: 90,
  scenario: 60,
}

/** One formula, so the same hue looks the same wherever it is drawn. */
export function hueColor(hue: number): string {
  return `oklch(0.62 0.15 ${hue})`
}

export function kindColor(kind: EntityKind): string {
  return hueColor(KIND_HUE[kind])
}

export interface OverviewNode {
  id: string
  ref: EntityRef
  name: string
  kindLabel: string
  /** The Blueprint's primary agent compiles to the root instruction file. */
  isPrimary: boolean
  /** Nothing references it, and something should. */
  isOrphan: boolean
  /** The worst diagnostic attached to this artifact, if any. */
  severity?: 'error' | 'warning'
}

export interface OverviewEdge {
  id: string
  source: string
  target: string
}

export interface OverviewGraph {
  nodes: OverviewNode[]
  edges: OverviewEdge[]
}

/**
 * The worst severity attached to each artifact, in one pass.
 *
 * Scanning the whole diagnostic list per node was quadratic, and a Blueprint with a hundred
 * artifacts and a hundred findings is not unusual.
 */
function severityByRef(diagnostics: readonly Diagnostic[]): Map<string, 'error' | 'warning'> {
  const worst = new Map<string, 'error' | 'warning'>()
  for (const diagnostic of diagnostics) {
    if (!diagnostic.ref) continue
    if (diagnostic.severity !== 'error' && diagnostic.severity !== 'warning') continue
    const key = refKey(diagnostic.ref)
    if (worst.get(key) === 'error') continue
    worst.set(key, diagnostic.severity)
  }
  return worst
}

/**
 * Nodes and edges for the overview, in a stable order.
 *
 * Only the kinds asked for are included, and an edge survives only when both of its ends do,
 * which is what makes filtering by kind produce a smaller graph rather than a broken one.
 */
export function overviewGraph(
  blueprint: Blueprint,
  options: { diagnostics?: readonly Diagnostic[]; kinds?: readonly EntityKind[] } = {},
): OverviewGraph {
  const graph = buildDependencyGraph(blueprint)
  const diagnostics = options.diagnostics ?? []
  const wanted = options.kinds ? new Set(options.kinds) : undefined
  const orphans = new Set(findOrphans(graph).map(refKey))
  const worst = severityByRef(diagnostics)

  const nodes = graph.nodes
    .filter((ref) => !wanted || wanted.has(ref.kind))
    .map((ref) => {
      const severity = worst.get(refKey(ref))
      return {
        id: refKey(ref),
        ref,
        name: findEntity(blueprint, ref.kind, ref.id)?.name ?? ref.id,
        kindLabel: ENTITY_KIND_INFO[ref.kind].label,
        isPrimary: ref.kind === 'agent' && graph.primaryAgentId === ref.id,
        isOrphan: orphans.has(refKey(ref)),
        ...(severity ? { severity } : {}),
      }
    })

  const visible = new Set(nodes.map((node) => node.id))
  const seen = new Set<string>()
  const edges: OverviewEdge[] = []

  for (const edge of graph.edges) {
    const source = refKey(edge.from)
    const target = refKey(edge.to)
    if (!visible.has(source) || !visible.has(target)) continue
    // Two artifacts can be joined by more than one relation; one line is enough to say so.
    const id = `${source}->${target}`
    if (seen.has(id)) continue
    seen.add(id)
    edges.push({ id, source, target })
  }

  return { nodes, edges }
}

/** Node box used for layout, and matched by the CSS so edges meet the boxes they connect. */
export const OVERVIEW_NODE_SIZE = { width: 168, height: 44 } as const

/** Which kinds this Blueprint has anything of, for the filter row. */
export function kindsPresent(blueprint: Blueprint): EntityKind[] {
  return ENTITY_KINDS.filter((kind) => getCollection(blueprint, kind).length > 0)
}
