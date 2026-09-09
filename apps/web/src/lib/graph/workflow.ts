/**
 * Editing a workflow graph.
 *
 * Every operation is a pure function from one workflow to the next, so the editor holds no
 * state of its own and the whole of it can be exercised without rendering anything. Each
 * result goes back through `upsertEntity`, which means a graph the schema would reject never
 * becomes state, exactly as with the forms.
 *
 * Positions are part of a workflow and are written to the project file, unlike the overview
 * graph. That is why `tidy` uses the same deterministic layout: a tidy that placed nodes
 * differently each time would turn every use of it into a spurious diff.
 */
import {
  type Diagnostic,
  slugify,
  uniqueSlug,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
  type WORKFLOW_EDGE_KINDS,
  type WORKFLOW_NODE_TYPES,
} from '@agent-blueprint/core'

import { layoutGraph } from '@/lib/graph/layout'

export type NodeType = (typeof WORKFLOW_NODE_TYPES)[number]
export type EdgeKind = (typeof WORKFLOW_EDGE_KINDS)[number]

export interface NodeTypeInfo {
  label: string
  /** What the step does, shown in the palette. */
  hint: string
  hue: number
  /** Which artifact, if any, this type of step points at. */
  refField?: 'agentId' | 'skillId' | 'toolId' | 'gateId'
}

/**
 * The sixteen step types, with the wording the palette uses. The hue groups them: work is
 * blue-ish, checks are green, control flow is amber, and the ends are neutral.
 */
export const NODE_TYPE_INFO: Record<NodeType, NodeTypeInfo> = {
  start: { label: 'Start', hint: 'Where the workflow begins', hue: 250 },
  end: { label: 'End', hint: 'Where it finishes', hue: 250 },
  agent: { label: 'Agent', hint: 'An agent does the work', hue: 264, refField: 'agentId' },
  skill: { label: 'Skill', hint: 'Apply a skill', hue: 200, refField: 'skillId' },
  tool: { label: 'Tool', hint: 'Use a tool', hue: 140, refField: 'toolId' },
  condition: { label: 'Condition', hint: 'Branch on a question', hue: 60 },
  verification: { label: 'Verification', hint: 'Prove it worked', hue: 150 },
  review: { label: 'Review', hint: 'Another pass over the work', hue: 170 },
  gate: { label: 'Gate', hint: 'A checkpoint that can stop it', hue: 25, refField: 'gateId' },
  'human-approval': { label: 'Human approval', hint: 'Ask a person', hue: 320 },
  output: { label: 'Output', hint: 'Produce the result', hue: 230 },
  parallel: { label: 'Parallel', hint: 'Split into branches', hue: 45 },
  merge: { label: 'Merge', hint: 'Bring the branches back', hue: 45 },
  retry: { label: 'Retry', hint: 'Try again, up to a limit', hue: 30 },
  delegate: { label: 'Delegate', hint: 'Hand off to another agent', hue: 290, refField: 'agentId' },
  synthesis: { label: 'Synthesis', hint: 'Combine what came back', hue: 210 },
}

export interface EdgeKindInfo {
  label: string
  hint: string
  dashed: boolean
}

export const EDGE_KIND_INFO: Record<EdgeKind, EdgeKindInfo> = {
  sequential: { label: 'Then', hint: 'The ordinary next step', dashed: false },
  parallel: { label: 'In parallel', hint: 'Runs alongside its siblings', dashed: false },
  conditional: { label: 'If', hint: 'Taken when the condition holds', dashed: true },
  fallback: { label: 'Otherwise', hint: 'Taken when the others do not', dashed: true },
  retry: { label: 'Retry', hint: 'Goes back to try again', dashed: true },
  delegation: { label: 'Delegates to', hint: 'Hands the work over', dashed: false },
  review: { label: 'For review', hint: 'Sends the work to be checked', dashed: false },
  aggregation: { label: 'Collects into', hint: 'Feeds a merge or synthesis', dashed: false },
}

export function nodeColor(type: NodeType): string {
  return `oklch(0.62 0.15 ${NODE_TYPE_INFO[type].hue})`
}

/** Node box used for layout, matched by the CSS so edges meet the boxes they connect. */
export const WORKFLOW_NODE_SIZE = { width: 190, height: 52 } as const

function nodeIds(workflow: Workflow): string[] {
  return workflow.nodes.map((node) => node.id)
}

/** A new step, placed where it was dropped. */
export function addNode(
  workflow: Workflow,
  type: NodeType,
  position: { x: number; y: number },
): { workflow: Workflow; nodeId: string } {
  const label = NODE_TYPE_INFO[type].label
  const id = uniqueSlug(label, nodeIds(workflow), type)
  const node: WorkflowNode = {
    id,
    type,
    label,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    config: { contextInputs: [] },
  }
  return {
    workflow: {
      ...workflow,
      nodes: [...workflow.nodes, node],
      // The first step to exist is the entry, because a workflow without one is an error
      // and nobody wants to be told so by their first click.
      ...(workflow.entryNodeId === undefined ? { entryNodeId: id } : {}),
    },
    nodeId: id,
  }
}

/** Removing a step removes the edges that reached it, and the entry if it was the entry. */
export function removeNode(workflow: Workflow, nodeId: string): Workflow {
  const nodes = workflow.nodes.filter((node) => node.id !== nodeId)
  const next: Workflow = {
    ...workflow,
    nodes,
    edges: workflow.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
  }
  if (workflow.entryNodeId !== nodeId) return next
  // Something has to be the entry; the first remaining step is a better guess than nothing.
  const replacement = nodes.find((node) => node.type === 'start') ?? nodes[0]
  return replacement
    ? { ...next, entryNodeId: replacement.id }
    : { ...next, entryNodeId: undefined }
}

export function moveNode(
  workflow: Workflow,
  nodeId: string,
  position: { x: number; y: number },
): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      node.id === nodeId
        ? { ...node, position: { x: Math.round(position.x), y: Math.round(position.y) } }
        : node,
    ),
  }
}

export function updateNode(
  workflow: Workflow,
  nodeId: string,
  patch: Partial<WorkflowNode>,
): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
  }
}

export function updateNodeConfig(
  workflow: Workflow,
  nodeId: string,
  patch: Record<string, unknown>,
): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      node.id === nodeId ? { ...node, config: { ...node.config, ...patch } } : node,
    ),
  }
}

export function setEntry(workflow: Workflow, nodeId: string): Workflow {
  return { ...workflow, entryNodeId: nodeId }
}

/** Joins two steps. A duplicate connection is not an error; it is simply already there. */
export function connect(
  workflow: Workflow,
  from: string,
  to: string,
  kind: EdgeKind = 'sequential',
): Workflow {
  if (from === to) return workflow
  if (workflow.edges.some((edge) => edge.from === from && edge.to === to)) return workflow

  const id = uniqueSlug(
    `${slugify(from)}-${slugify(to)}`,
    workflow.edges.map((edge) => edge.id),
    'edge',
  )
  const edge: WorkflowEdge = { id, from, to, kind, required: true }
  return { ...workflow, edges: [...workflow.edges, edge] }
}

export function removeEdge(workflow: Workflow, edgeId: string): Workflow {
  return { ...workflow, edges: workflow.edges.filter((edge) => edge.id !== edgeId) }
}

export function updateEdge(
  workflow: Workflow,
  edgeId: string,
  patch: Partial<WorkflowEdge>,
): Workflow {
  return {
    ...workflow,
    edges: workflow.edges.map((edge) => (edge.id === edgeId ? { ...edge, ...patch } : edge)),
  }
}

/**
 * Drops a template's steps into an existing workflow.
 *
 * A template is a whole workflow, and inserting one is how a half-built graph gets the shape
 * of a review loop or a bug hunt without drawing it again. Ids are made unique against what
 * is already there and the connections are rewritten to match, so a template can be inserted
 * twice without the two copies fusing into one.
 *
 * The steps arrive unconnected to what was already there. Which step they follow is a
 * decision only the author can make, and guessing it would be worse than one drag.
 */
export function insertSubgraph(
  workflow: Workflow,
  subgraph: Pick<Workflow, 'nodes' | 'edges'>,
): { workflow: Workflow; nodeIds: string[] } {
  const taken = new Set(nodeIds(workflow))
  const takenEdges = new Set(workflow.edges.map((edge) => edge.id))
  const renamed = new Map<string, string>()

  const nodes = subgraph.nodes.map((node) => {
    const id = uniqueSlug(node.id, taken, 'step')
    taken.add(id)
    renamed.set(node.id, id)
    return { ...node, id }
  })

  const edges = subgraph.edges
    .filter((edge) => renamed.has(edge.from) && renamed.has(edge.to))
    .map((edge) => {
      const id = uniqueSlug(edge.id, takenEdges, 'edge')
      takenEdges.add(id)
      return { ...edge, id, from: renamed.get(edge.from)!, to: renamed.get(edge.to)! }
    })

  // Placed to one side of what is already drawn, so the insertion is visible rather than
  // buried under the existing steps. Tidy is one click away for anyone who wants it neat.
  const placed = nodes.map((node) => ({
    ...node,
    position: { x: node.position.x + 320, y: node.position.y },
  }))

  return {
    workflow: {
      ...workflow,
      nodes: [...workflow.nodes, ...placed],
      edges: [...workflow.edges, ...edges],
      ...(workflow.entryNodeId === undefined && placed[0] ? { entryNodeId: placed[0].id } : {}),
    },
    nodeIds: placed.map((node) => node.id),
  }
}

/**
 * Lays the workflow out and writes the positions.
 *
 * Downwards, because a workflow is read as a sequence of steps and every harness compiles it
 * into an ordered list. The layout is the same deterministic one the overview uses, so
 * tidying an unchanged workflow twice writes the same file.
 */
export async function tidy(workflow: Workflow): Promise<Workflow> {
  if (workflow.nodes.length === 0) return workflow

  const positions = await layoutGraph(
    workflow.nodes.map((node) => ({ id: node.id, ...WORKFLOW_NODE_SIZE })),
    workflow.edges.map((edge) => ({ id: edge.id, source: edge.from, target: edge.to })),
    { direction: 'DOWN', nodeSpacing: 48, layerSpacing: 72 },
  )

  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      position: positions[node.id] ?? node.position,
    })),
  }
}

/** Diagnostics that name a step, keyed by that step's id. */
export function diagnosticsByNode(
  diagnostics: readonly Diagnostic[],
  workflowId: string,
): Map<string, Diagnostic[]> {
  const byNode = new Map<string, Diagnostic[]>()

  const add = (nodeId: unknown, diagnostic: Diagnostic) => {
    if (typeof nodeId !== 'string') return
    byNode.set(nodeId, [...(byNode.get(nodeId) ?? []), diagnostic])
  }

  for (const diagnostic of diagnostics) {
    if (diagnostic.ref?.kind !== 'workflow' || diagnostic.ref.id !== workflowId) continue
    const data = diagnostic.data as Record<string, unknown> | undefined
    if (!data) continue
    add(data['nodeId'], diagnostic)
    if (Array.isArray(data['nodeIds'])) {
      for (const id of data['nodeIds']) add(id, diagnostic)
    }
  }
  return byNode
}
