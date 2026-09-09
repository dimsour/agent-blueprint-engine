/**
 * Turns a workflow graph into a linear reading order.
 *
 * Harnesses execute instructions, not graphs, so the compiler has to decide what "step 1,
 * step 2, …" means for an arbitrary graph. The rules (docs/04-compiler.md):
 *
 * - Forward edges (`sequential`, `conditional`, `review`, `delegation`, `aggregation`) are
 *   followed; `retry` and `fallback` edges are recorded on their source step and never
 *   followed, because they point backwards and would not terminate.
 * - A node with several outgoing `parallel` edges opens a parallel group; a node with
 *   several forward edges opens a branch group (a condition). Both walk each branch until
 *   the branches converge, then continue from the convergence node.
 * - Ties are broken by target node id so the order is stable.
 */
import type { Workflow, WorkflowEdge, WorkflowNode } from '@agent-blueprint/core'

const FORWARD_KINDS = new Set<WorkflowEdge['kind']>([
  'sequential',
  'conditional',
  'review',
  'delegation',
  'aggregation',
])

const DEFERRED_KINDS = new Set<WorkflowEdge['kind']>(['retry', 'fallback'])

export interface WalkStep {
  kind: 'step'
  node: WorkflowNode
  /** `retry` and `fallback` edges leaving this node, rendered as notes on the step. */
  deferred: WorkflowEdge[]
}

export interface WalkGroup {
  kind: 'group'
  /** `parallel` when the branches run at the same time, `branch` for a conditional split. */
  groupKind: 'parallel' | 'branch'
  /** The node the branches leave from. */
  node: WorkflowNode
  branches: { edge: WorkflowEdge; items: WalkItem[] }[]
  deferred: WorkflowEdge[]
}

export type WalkItem = WalkStep | WalkGroup

export interface WorkflowWalk {
  items: WalkItem[]
  /** Nodes no forward path from the entry node reaches. */
  unreachable: WorkflowNode[]
  /** Set when the workflow has no usable entry node. */
  entryProblem?: string
}

const byEdgeOrder = (a: WorkflowEdge, b: WorkflowEdge): number =>
  a.to === b.to ? (a.id < b.id ? -1 : 1) : a.to < b.to ? -1 : 1

export function walkWorkflow(workflow: Workflow): WorkflowWalk {
  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, WorkflowEdge[]>()
  for (const edge of workflow.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue
    const list = outgoing.get(edge.from)
    if (list) list.push(edge)
    else outgoing.set(edge.from, [edge])
  }
  for (const list of outgoing.values()) list.sort(byEdgeOrder)

  const entryId = workflow.entryNodeId ?? workflow.nodes.find((n) => n.type === 'start')?.id
  if (entryId === undefined || !nodes.has(entryId)) {
    return {
      items: [],
      unreachable: [...workflow.nodes],
      entryProblem: 'the workflow has no entry node',
    }
  }

  const edgesOf = (id: string): WorkflowEdge[] => outgoing.get(id) ?? []
  const forwardOf = (id: string) => edgesOf(id).filter((e) => FORWARD_KINDS.has(e.kind))
  const parallelOf = (id: string) => edgesOf(id).filter((e) => e.kind === 'parallel')
  const deferredOf = (id: string) => edgesOf(id).filter((e) => DEFERRED_KINDS.has(e.kind))

  /** Nodes reachable from `id` over forward and parallel edges. */
  const reachableFrom = (id: string): Set<string> => {
    const seen = new Set<string>()
    const queue = [id]
    while (queue.length > 0) {
      const current = queue.shift()
      if (current === undefined || seen.has(current)) continue
      seen.add(current)
      for (const edge of [...forwardOf(current), ...parallelOf(current)]) queue.push(edge.to)
    }
    return seen
  }

  /** The first node every branch reaches, in the first branch's order. */
  const convergenceOf = (starts: string[]): string | undefined => {
    if (starts.length < 2) return undefined
    const [first, ...rest] = starts
    if (first === undefined) return undefined
    const others = rest.map(reachableFrom)
    const queue = [first]
    const seen = new Set<string>()
    while (queue.length > 0) {
      const current = queue.shift()
      if (current === undefined || seen.has(current)) continue
      seen.add(current)
      if (others.every((set) => set.has(current))) return current
      for (const edge of [...forwardOf(current), ...parallelOf(current)]) queue.push(edge.to)
    }
    return undefined
  }

  const visited = new Set<string>()

  const walk = (startId: string, stopAt: ReadonlySet<string>): WalkItem[] => {
    const items: WalkItem[] = []
    let currentId: string | undefined = startId

    while (currentId !== undefined && !stopAt.has(currentId) && !visited.has(currentId)) {
      const node: WorkflowNode | undefined = nodes.get(currentId)
      if (node === undefined) break
      visited.add(currentId)

      const deferred = deferredOf(currentId)
      const parallel = parallelOf(currentId)
      const forward = forwardOf(currentId)
      const branchEdges = parallel.length > 0 ? parallel : forward.length > 1 ? forward : []

      if (branchEdges.length > 1) {
        const convergence = convergenceOf(branchEdges.map((edge) => edge.to))
        const stop = new Set(stopAt)
        if (convergence !== undefined) stop.add(convergence)
        items.push({
          kind: 'group',
          groupKind: parallel.length > 0 ? 'parallel' : 'branch',
          node,
          branches: branchEdges.map((edge) => ({ edge, items: walk(edge.to, stop) })),
          deferred,
        })
        currentId = convergence
        continue
      }

      items.push({ kind: 'step', node, deferred })
      currentId = branchEdges[0]?.to ?? forward[0]?.to
    }

    return items
  }

  const items = walk(entryId, new Set())
  const unreachable = workflow.nodes.filter((node) => !visited.has(node.id))
  return { items, unreachable }
}

/** Depth-first list of the steps in walk order, for numbering and cross-references. */
export function flattenSteps(items: readonly WalkItem[]): WorkflowNode[] {
  const out: WorkflowNode[] = []
  for (const item of items) {
    if (item.kind === 'step') out.push(item.node)
    else {
      out.push(item.node)
      for (const branch of item.branches) out.push(...flattenSteps(branch.items))
    }
  }
  return out
}
