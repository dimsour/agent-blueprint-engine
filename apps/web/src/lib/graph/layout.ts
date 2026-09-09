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
import type { ElkNode } from 'elkjs/lib/elk.bundled.js'

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
 * ELK arrives when a layout is first asked for, not when the workspace loads.
 *
 * The bundled build is a megabyte and a half, and it runs without a worker, which is what
 * lets the tests call it unchanged. Importing it at the top of this module put all of that
 * on the critical path of every project, including for someone who only wanted to read the
 * export view. Loading it here costs one await the first time a graph is drawn.
 *
 * The instance is shared because ELK holds state across calls and one is cheaper than one
 * per layout.
 */
let engine: Promise<{ layout(graph: ElkNode): Promise<ElkNode> }> | undefined

function elk() {
  engine ??= import('elkjs/lib/elk.bundled.js').then((module) => new module.default())
  return engine
}

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

  const laid = await (await elk()).layout(graph)
  const positions: Positions = {}
  for (const child of laid.children ?? []) {
    positions[child.id] = { x: round(child.x), y: round(child.y) }
  }
  return positions
}
