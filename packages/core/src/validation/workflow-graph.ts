/**
 * Graph queries over a single workflow.
 *
 * The dependency graph in `dependencies/graph.ts` answers "which artifacts depend on which";
 * this file answers "how does control flow through one workflow", which is what the
 * reachability, dead-end and cycle rules need. Everything here is pure and works on the
 * normalized workflow (nodes and edges sorted by id), so results are deterministic.
 */
import type { Workflow, WorkflowEdge, WorkflowNode } from '../model/types'

export interface WorkflowGraph {
  readonly workflow: Workflow
  readonly nodeById: ReadonlyMap<string, WorkflowNode>
  outgoing(nodeId: string): readonly WorkflowEdge[]
  incoming(nodeId: string): readonly WorkflowEdge[]
}

export function buildWorkflowGraph(workflow: Workflow): WorkflowGraph {
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, WorkflowEdge[]>()
  const incoming = new Map<string, WorkflowEdge[]>()
  for (const edge of workflow.edges) {
    // Edges to unknown nodes are BP-WF-003; ignore them here so one broken edge does not
    // make every other rule report noise.
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue
    push(outgoing, edge.from, edge)
    push(incoming, edge.to, edge)
  }
  return {
    workflow,
    nodeById,
    outgoing: (nodeId) => outgoing.get(nodeId) ?? [],
    incoming: (nodeId) => incoming.get(nodeId) ?? [],
  }
}

function push<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/** Nodes reachable from `startId` by following edges of any kind, including `startId`. */
export function reachableFrom(graph: WorkflowGraph, startId: string): Set<string> {
  return traverse(graph, [startId], (nodeId) => graph.outgoing(nodeId).map((edge) => edge.to))
}

/** Nodes from which an `end` node is reachable, including the end nodes themselves. */
export function canReachEnd(graph: WorkflowGraph): Set<string> {
  const ends = graph.workflow.nodes.filter((node) => node.type === 'end').map((node) => node.id)
  return traverse(graph, ends, (nodeId) => graph.incoming(nodeId).map((edge) => edge.from))
}

function traverse(
  graph: WorkflowGraph,
  seeds: readonly string[],
  next: (nodeId: string) => string[],
): Set<string> {
  const seen = new Set<string>()
  const queue = seeds.filter((id) => graph.nodeById.has(id))
  while (queue.length > 0) {
    const nodeId = queue.pop()
    if (nodeId === undefined || seen.has(nodeId)) continue
    seen.add(nodeId)
    for (const neighbour of next(nodeId)) if (!seen.has(neighbour)) queue.push(neighbour)
  }
  return seen
}

/**
 * Nodes that lie on some path from `entryNodeId` to an end node: reachable from the entry
 * *and* able to reach an end. A workflow "has a verification step on some path" exactly when
 * one of these nodes is a verification step.
 */
export function nodesOnCompletePaths(graph: WorkflowGraph): Set<string> {
  const entryId = graph.workflow.entryNodeId
  if (entryId === undefined) return new Set()
  const forward = reachableFrom(graph, entryId)
  const backward = canReachEnd(graph)
  return new Set(Array.from(forward).filter((id) => backward.has(id)))
}

export interface WorkflowCycle {
  /** Node ids in the cycle, in the order the walk found them. */
  nodeIds: string[]
  edges: WorkflowEdge[]
}

/**
 * One cycle per back edge found by a depth-first walk, in node-id order so the result does
 * not depend on insertion order. Enough for reporting; not a full elementary-cycle census.
 */
export function findCycles(graph: WorkflowGraph): WorkflowCycle[] {
  const cycles: WorkflowCycle[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: { nodeId: string; edge?: WorkflowEdge }[] = []
  const seenCycles = new Set<string>()

  const visit = (nodeId: string, via?: WorkflowEdge): void => {
    const current = state.get(nodeId)
    if (current === 'done') return
    if (current === 'visiting') {
      const start = stack.findIndex((frame) => frame.nodeId === nodeId)
      if (start === -1) return
      const frames = stack.slice(start)
      const nodeIds = frames.map((frame) => frame.nodeId)
      const edges = frames
        .slice(1)
        .map((frame) => frame.edge)
        .filter((edge): edge is WorkflowEdge => edge !== undefined)
      if (via) edges.push(via)
      const key = [...nodeIds].sort().join('>')
      if (!seenCycles.has(key)) {
        seenCycles.add(key)
        cycles.push({ nodeIds, edges })
      }
      return
    }
    state.set(nodeId, 'visiting')
    stack.push(via ? { nodeId, edge: via } : { nodeId })
    for (const edge of [...graph.outgoing(nodeId)].sort(byId)) visit(edge.to, edge)
    stack.pop()
    state.set(nodeId, 'done')
  }

  for (const node of [...graph.workflow.nodes].sort(byId)) visit(node.id)
  return cycles
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
