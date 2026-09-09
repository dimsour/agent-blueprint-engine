/**
 * Automatic layout, from ELK.
 *
 * Two graphs in this product are laid out rather than drawn: the Blueprint overview, whose
 * positions are never stored, and a workflow being tidied, whose positions are. Both want
 * the same thing from a layout, so both come through here.
 *
 * The result has to be deterministic. ELK is, given identical input, so the input is sorted
 * before it is handed over: a Blueprint that has not changed must not produce a graph that
 * moves about between renders, and a tidy that wrote different positions each time would
 * make every workflow a source of spurious diffs.
 */
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'

export interface LayoutNode {
  id: string
  width: number
  height: number
}

export interface LayoutEdge {
  id: string
  source: string
  target: string
}

export type LayoutDirection = 'DOWN' | 'RIGHT'

export interface LayoutOptions {
  direction?: LayoutDirection
  /** Gap between nodes in the same layer. */
  nodeSpacing?: number
  /** Gap between layers. */
  layerSpacing?: number
}

export type Positions = Record<string, { x: number; y: number }>

/**
 * ELK is stateful enough that a shared instance is cheaper than one per call, and the
 * bundled build runs without a worker, which is what lets tests use it unchanged.
 */
const elk = new ELK()

/** Rounded so a position is stable to the pixel and cheap to compare in a test. */
function round(value: number | undefined): number {
  return Math.round(value ?? 0)
}

export async function layoutGraph(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions = {},
): Promise<Positions> {
  if (nodes.length === 0) return {}

  const known = new Set(nodes.map((node) => node.id))

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': options.direction ?? 'DOWN',
      'elk.spacing.nodeNode': String(options.nodeSpacing ?? 40),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(options.layerSpacing ?? 80),
      // Without a fixed strategy ELK picks one from the graph, which is stable but harder
      // to reason about; naming it keeps the result the same across versions of the input.
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    // Sorted, because ELK's output depends on the order it is given.
    children: [...nodes]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((node) => ({ id: node.id, width: node.width, height: node.height })),
    edges: [...edges]
      .filter((edge) => known.has(edge.source) && known.has(edge.target))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  }

  const laid = await elk.layout(graph)
  const positions: Positions = {}
  for (const child of laid.children ?? []) {
    positions[child.id] = { x: round(child.x), y: round(child.y) }
  }
  return positions
}
