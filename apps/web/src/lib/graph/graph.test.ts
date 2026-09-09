import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { validateBlueprint } from '@agent-blueprint/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { layoutGraph } from '@/lib/graph/layout'
import { kindColor, overviewGraph, OVERVIEW_NODE_SIZE } from '@/lib/graph/overview'
import { parseProject } from '@/lib/storage'

let blueprint: Awaited<ReturnType<typeof parseProject>>['blueprint']

beforeAll(async () => {
  blueprint = (await parseProject(readFixtureFiles('dotnet-testing-expert'))).blueprint
})

describe('overviewGraph', () => {
  it('has a node for every artifact', () => {
    const { nodes } = overviewGraph(blueprint)
    expect(nodes).toHaveLength(19)
  })

  it('names the primary agent, which becomes the root instruction file', () => {
    const primary = overviewGraph(blueprint).nodes.filter((node) => node.isPrimary)
    expect(primary.map((node) => node.ref.id)).toEqual(['testing-expert'])
  })

  it('draws one line between two artifacts however many references join them', () => {
    const { edges } = overviewGraph(blueprint)
    expect(new Set(edges.map((edge) => edge.id)).size).toBe(edges.length)
  })

  it('filtering by kind leaves a smaller graph, not a broken one', () => {
    const { nodes, edges } = overviewGraph(blueprint, { kinds: ['agent', 'skill'] })
    const ids = new Set(nodes.map((node) => node.id))

    expect(nodes.every((node) => node.ref.kind === 'agent' || node.ref.kind === 'skill')).toBe(true)
    expect(edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))).toBe(true)
  })

  it('carries the worst diagnostic on each artifact', () => {
    const broken = {
      ...blueprint,
      skills: blueprint.skills.map((skill, index) =>
        index === 0 ? { ...skill, description: undefined } : skill,
      ),
    }
    const diagnostics = validateBlueprint(broken)
    const node = overviewGraph(broken, { diagnostics }).nodes.find(
      (candidate) => candidate.ref.id === blueprint.skills[0]?.id,
    )

    expect(node?.severity).toBeDefined()
  })

  it('gives every kind its own colour', () => {
    const hues = new Set(overviewGraph(blueprint).nodes.map((node) => kindColor(node.ref.kind)))
    expect(hues.size).toBeGreaterThan(1)
  })
})

describe('layoutGraph', () => {
  it('places every node once, and in the same place each time', async () => {
    const { nodes, edges } = overviewGraph(blueprint)
    const boxes = nodes.map((node) => ({ id: node.id, ...OVERVIEW_NODE_SIZE }))

    const first = await layoutGraph(boxes, edges)
    // Reversed input: a layout that depended on iteration order would move.
    const second = await layoutGraph([...boxes].reverse(), [...edges].reverse())

    expect(Object.keys(first)).toHaveLength(nodes.length)
    expect(second).toEqual(first)
  })

  it('does not stack two nodes on the same spot', async () => {
    const { nodes, edges } = overviewGraph(blueprint)
    const positions = await layoutGraph(
      nodes.map((node) => ({ id: node.id, ...OVERVIEW_NODE_SIZE })),
      edges,
    )
    const spots = Object.values(positions).map((point) => `${point.x},${point.y}`)

    expect(new Set(spots).size).toBe(spots.length)
  })

  it('ignores an edge that points at a node it was not given', async () => {
    const positions = await layoutGraph(
      [{ id: 'a', width: 100, height: 40 }],
      [{ id: 'e1', source: 'a', target: 'gone' }],
    )
    expect(Object.keys(positions)).toEqual(['a'])
  })

  it('has nothing to place for an empty Blueprint', async () => {
    expect(await layoutGraph([], [])).toEqual({})
  })
})
