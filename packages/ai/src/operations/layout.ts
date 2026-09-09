/**
 * Where a generated workflow's steps sit.
 *
 * A model is asked for a graph, not a drawing, so it never sends positions — but a workflow
 * with every step at the origin opens as a pile. This lays them out by depth from the entry
 * step: one column per depth, one row per step within it. It is not a good layout, and it is
 * not meant to be; the editor's Tidy does that properly with a real layout engine. It is
 * meant to be a legible starting point that is the same every time, since a position is
 * written to disk and the same input has to produce the same bytes (AGENTS.md rule 3).
 */
import type { WorkflowEdge, WorkflowNode } from '@agent-blueprint/core'

/** Matches the node box the editor draws, so nothing overlaps on first open. */
export const LAYOUT_STEP = { x: 260, y: 120 } as const

type PositionlessNode = Omit<WorkflowNode, 'position'>

export function layoutWorkflowNodes(
  nodes: readonly PositionlessNode[],
  edges: readonly Pick<WorkflowEdge, 'from' | 'to'>[],
  entryNodeId: string | undefined,
): WorkflowNode[] {
  const depths = depthsFrom(nodes, edges, entryNodeId)
  const rowsUsed = new Map<number, number>()
  return nodes.map((node) => {
    const depth = depths.get(node.id) ?? 0
    const row = rowsUsed.get(depth) ?? 0
    rowsUsed.set(depth, row + 1)
    return { ...node, position: { x: depth * LAYOUT_STEP.x, y: row * LAYOUT_STEP.y } }
  })
}

/**
 * Longest path from the entry step, so a step that joins two branches sits after both rather
 * than beside the shorter one. Steps the edges never reach get depth 0 and land in the first
 * column, which is where an unreachable step should be noticed.
 */
function depthsFrom(
  nodes: readonly PositionlessNode[],
  edges: readonly Pick<WorkflowEdge, 'from' | 'to'>[],
  entryNodeId: string | undefined,
): Map<string, number> {
  const depths = new Map<string, number>()
  const start = entryNodeId ?? nodes[0]?.id
  if (start === undefined) return depths

  depths.set(start, 0)
  // Relaxation, bounded by the node count: a cycle cannot make a path longer than that.
  const passes = nodes.length
  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false
    for (const edge of edges) {
      const from = depths.get(edge.from)
      if (from === undefined) continue
      const candidate = from + 1
      if ((depths.get(edge.to) ?? -1) < candidate && candidate < nodes.length) {
        depths.set(edge.to, candidate)
        changed = true
      }
    }
    if (!changed) break
  }
  return depths
}
