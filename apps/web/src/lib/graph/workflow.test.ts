import { readFixtureFiles } from '@agent-blueprint/fixtures'
import {
  type Blueprint,
  validateBlueprint,
  type Workflow,
  WORKFLOW_EDGE_KINDS,
  WORKFLOW_NODE_TYPES,
  workflowSchema,
} from '@agent-blueprint/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { EDGE_KIND_INFO, NODE_TYPE_INFO, WORKFLOW_NODE_SIZE } from '@/lib/graph/steps'
import {
  addNode,
  connect,
  diagnosticsByNode,
  insertSubgraph,
  removeEdge,
  removeNode,
  setEntry,
  tidy,
  updateEdge,
  updateNode,
  updateNodeConfig,
} from '@/lib/graph/workflow'
import { parseProject } from '@/lib/storage'

let blueprint: Blueprint
let workflow: Workflow

beforeAll(async () => {
  blueprint = (await parseProject(readFixtureFiles('dotnet-testing-expert'))).blueprint
  workflow = blueprint.workflows[0]!
})

/** Every operation must leave something the schema still accepts. */
const valid = (candidate: Workflow) => workflowSchema.safeParse(candidate).success

describe('the palette', () => {
  it('describes every node type and every edge kind', () => {
    expect(Object.keys(NODE_TYPE_INFO).sort()).toEqual([...WORKFLOW_NODE_TYPES].sort())
    expect(Object.keys(EDGE_KIND_INFO).sort()).toEqual([...WORKFLOW_EDGE_KINDS].sort())
  })
})

describe('adding and removing steps', () => {
  it('adds a step where it was dropped, with a valid id', () => {
    const { workflow: next, nodeId } = addNode(workflow, 'verification', { x: 12.4, y: 80.6 })
    const added = next.nodes.find((node) => node.id === nodeId)

    expect(added?.type).toBe('verification')
    expect(added?.position).toEqual({ x: 12, y: 81 })
    expect(valid(next)).toBe(true)
  })

  it('gives a second step of the same type its own id', () => {
    const once = addNode(workflow, 'verification', { x: 0, y: 0 })
    const twice = addNode(once.workflow, 'verification', { x: 0, y: 0 })

    expect(twice.nodeId).not.toBe(once.nodeId)
    expect(valid(twice.workflow)).toBe(true)
  })

  it('makes the first step of an empty workflow the entry', () => {
    const empty: Workflow = { ...workflow, nodes: [], edges: [], entryNodeId: undefined }
    const { workflow: next, nodeId } = addNode(empty, 'start', { x: 0, y: 0 })

    expect(next.entryNodeId).toBe(nodeId)
  })

  it('removes the edges that reached a deleted step', () => {
    const target = workflow.edges[0]!.to
    const next = removeNode(workflow, target)

    expect(next.nodes.some((node) => node.id === target)).toBe(false)
    expect(next.edges.some((edge) => edge.from === target || edge.to === target)).toBe(false)
    expect(valid(next)).toBe(true)
  })

  it('hands the entry to another step rather than leaving none', () => {
    const next = removeNode(workflow, workflow.entryNodeId!)

    expect(next.entryNodeId).toBeDefined()
    expect(next.nodes.some((node) => node.id === next.entryNodeId)).toBe(true)
  })

  it('leaves no entry when the last step goes', () => {
    const single: Workflow = {
      ...workflow,
      nodes: [workflow.nodes[0]!],
      edges: [],
      entryNodeId: workflow.nodes[0]!.id,
    }
    expect(removeNode(single, single.nodes[0]!.id).entryNodeId).toBeUndefined()
  })
})

describe('connecting steps', () => {
  it('joins two steps with the kind that was chosen', () => {
    const [first, second] = [workflow.nodes[0]!, workflow.nodes[2]!]
    const next = connect(workflow, first.id, second.id, 'fallback')
    const added = next.edges.find((edge) => edge.from === first.id && edge.to === second.id)

    expect(added?.kind).toBe('fallback')
    expect(valid(next)).toBe(true)
  })

  it('will not connect a step to itself', () => {
    const id = workflow.nodes[0]!.id
    expect(connect(workflow, id, id).edges).toHaveLength(workflow.edges.length)
  })

  it('does not add a connection that is already there', () => {
    const existing = workflow.edges[0]!
    const next = connect(workflow, existing.from, existing.to)

    expect(next.edges).toHaveLength(workflow.edges.length)
  })

  it('removes and re-labels an edge', () => {
    const edge = workflow.edges[0]!
    expect(removeEdge(workflow, edge.id).edges).toHaveLength(workflow.edges.length - 1)

    const relabelled = updateEdge(workflow, edge.id, { kind: 'review', label: 'send back' })
    expect(relabelled.edges.find((e) => e.id === edge.id)?.label).toBe('send back')
    expect(valid(relabelled)).toBe(true)
  })
})

describe('editing a step', () => {
  it('renames it and points it at an artifact', () => {
    const node = workflow.nodes.find((candidate) => candidate.type === 'agent')!
    const renamed = updateNode(workflow, node.id, { label: 'Write the tests' })
    const pointed = updateNodeConfig(renamed, node.id, { agentId: 'testing-expert' })

    expect(pointed.nodes.find((n) => n.id === node.id)?.label).toBe('Write the tests')
    expect(pointed.nodes.find((n) => n.id === node.id)?.config.agentId).toBe('testing-expert')
    expect(valid(pointed)).toBe(true)
  })

  it('keeps the rest of the config when one field changes', () => {
    const node = workflow.nodes[1]!
    const next = updateNodeConfig(workflow, node.id, { outputSpec: 'A passing test file' })
    const after = next.nodes.find((n) => n.id === node.id)

    expect(after?.config.outputSpec).toBe('A passing test file')
    expect(after?.config.contextInputs).toEqual(node.config.contextInputs)
  })

  it('sets the entry step', () => {
    const other = workflow.nodes.at(-1)!
    expect(setEntry(workflow, other.id).entryNodeId).toBe(other.id)
  })
})

describe('inserting a template as a subgraph', () => {
  const template = () => ({
    nodes: [
      {
        id: 'start',
        type: 'start' as const,
        label: 'Start',
        position: { x: 0, y: 0 },
        config: { contextInputs: [] },
      },
      {
        id: 'check',
        type: 'verification' as const,
        label: 'Check',
        position: { x: 0, y: 100 },
        config: { contextInputs: [] },
      },
    ],
    edges: [{ id: 'e1', from: 'start', to: 'check', kind: 'sequential' as const, required: true }],
  })

  it('brings the steps and the connections between them', () => {
    const { workflow: next, nodeIds } = insertSubgraph(workflow, template())

    expect(next.nodes).toHaveLength(workflow.nodes.length + 2)
    expect(next.edges).toHaveLength(workflow.edges.length + 1)
    expect(nodeIds).toHaveLength(2)
    expect(valid(next)).toBe(true)
  })

  it('can be inserted twice without the two copies fusing', () => {
    const once = insertSubgraph(workflow, template())
    const twice = insertSubgraph(once.workflow, template())

    const ids = twice.workflow.nodes.map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    // The second copy's connection joins the second copy's steps, not the first's.
    const added = twice.workflow.edges.at(-1)!
    expect(twice.nodeIds).toContain(added.from)
    expect(twice.nodeIds).toContain(added.to)
    expect(valid(twice.workflow)).toBe(true)
  })

  it('does not connect the template to what was already there', () => {
    const { workflow: next, nodeIds } = insertSubgraph(workflow, template())
    const crossing = next.edges.filter(
      (edge) => nodeIds.includes(edge.from) !== nodeIds.includes(edge.to),
    )
    expect(crossing).toEqual([])
  })

  it('makes the first inserted step the entry of an empty workflow', () => {
    const empty: Workflow = { ...workflow, nodes: [], edges: [], entryNodeId: undefined }
    const { workflow: next, nodeIds } = insertSubgraph(empty, template())
    expect(next.entryNodeId).toBe(nodeIds[0])
  })
})

describe('tidy', () => {
  it('writes positions, and the same ones every time', async () => {
    const once = await tidy(workflow)
    const twice = await tidy(await tidy(workflow))

    expect(once.nodes.map((node) => node.position)).toEqual(
      twice.nodes.map((node) => node.position),
    )
    expect(valid(once)).toBe(true)
  })

  it('leaves no two steps on top of each other', async () => {
    const tidied = await tidy(workflow)
    const spots = tidied.nodes.map((node) => `${node.position.x},${node.position.y}`)

    expect(new Set(spots).size).toBe(spots.length)
  })

  it('keeps the steps and edges it was given', async () => {
    const tidied = await tidy(workflow)

    expect(tidied.nodes.map((node) => node.id)).toEqual(workflow.nodes.map((node) => node.id))
    expect(tidied.edges).toEqual(workflow.edges)
  })

  it('has nothing to do for an empty workflow', async () => {
    const empty: Workflow = { ...workflow, nodes: [], edges: [] }
    expect(await tidy(empty)).toEqual(empty)
  })

  it('lays steps out at the size the editor draws them', () => {
    expect(WORKFLOW_NODE_SIZE.width).toBeGreaterThan(0)
    expect(WORKFLOW_NODE_SIZE.height).toBeGreaterThan(0)
  })
})

describe('diagnosticsByNode', () => {
  it('finds the step a diagnostic is about', () => {
    // Disconnecting a step is the case BP-WF-010 exists for.
    const orphaned = removeEdge(workflow, workflow.edges[1]!.id)
    const broken: Blueprint = {
      ...blueprint,
      workflows: blueprint.workflows.map((candidate) =>
        candidate.id === workflow.id ? orphaned : candidate,
      ),
    }

    const byNode = diagnosticsByNode(validateBlueprint(broken), workflow.id)
    expect(byNode.size).toBeGreaterThan(0)
    expect([...byNode.values()].flat().some((d) => d.code.startsWith('BP-WF-'))).toBe(true)
  })

  it('says nothing about a workflow with no findings', () => {
    expect(diagnosticsByNode(validateBlueprint(blueprint), workflow.id).size).toBe(0)
  })
})
