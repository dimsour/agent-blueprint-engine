import {
  type AnyEntity,
  type ChangeSet,
  changeOpId,
  ENTITY_KIND_INFO,
  type EntityKind,
  type WorkflowInput,
} from '@agent-blueprint/core'

import type { ArtifactTemplate, TemplateParams } from '../types'

interface TemplateSpec<TInput> {
  id: string
  kind: EntityKind
  label: string
  description: string
  /** Runs the entity input through its Zod schema so the change-set carries a valid entity. */
  parse: (input: TInput) => AnyEntity
  make: (params: TemplateParams) => TInput
}

/**
 * Build an {@link ArtifactTemplate} from a per-kind schema parser and a content factory.
 * The resulting change-set has one deterministic `create` op.
 */
export function defineTemplate<TInput>(spec: TemplateSpec<TInput>): ArtifactTemplate {
  return {
    id: spec.id,
    kind: spec.kind,
    label: spec.label,
    description: spec.description,
    build(params: TemplateParams): ChangeSet {
      const after = spec.parse(spec.make(params))
      const op = { type: 'create', kind: spec.kind, entityId: params.id, after } as const
      return {
        id: `template:${spec.id}:${params.id}`,
        source: 'template',
        summary: `Create ${ENTITY_KIND_INFO[spec.kind].label.toLowerCase()} "${params.name}" from the ${spec.label} template`,
        ops: [{ id: changeOpId(op), ...op }],
      }
    },
  }
}

/** Markdown body helper: template literals are written at column 0 and trimmed here. */
export function body(text: string): string {
  return text.trim()
}

type WorkflowNodeInput = NonNullable<WorkflowInput['nodes']>[number]
type WorkflowEdgeInput = NonNullable<WorkflowInput['edges']>[number]

export type StepSpec = Omit<WorkflowNodeInput, 'position'>

export interface Graph {
  entryNodeId: string
  nodes: WorkflowNodeInput[]
  edges: WorkflowEdgeInput[]
}

/**
 * Lay out a workflow that fans out into parallel branches and merges again.
 *
 * `before` runs in sequence and must end with the `parallel` node that opens the group;
 * each branch runs on its own column; every branch tail feeds the merge node with an
 * `aggregation` edge; `after` continues in sequence below it.
 */
export function fanOut(spec: {
  before: StepSpec[]
  branches: StepSpec[][]
  merge: StepSpec
  after: StepSpec[]
}): Graph {
  const entry = spec.before[0]
  const split = spec.before[spec.before.length - 1]
  if (!entry || !split) throw new Error('fanOut() needs at least one step before the branches')
  if (spec.branches.length < 2) throw new Error('fanOut() needs at least two branches')

  const nodes: WorkflowNodeInput[] = []
  const edges: WorkflowEdgeInput[] = []
  const COLUMN = 280
  const ROW = 120

  spec.before.forEach((step, index) => {
    nodes.push({ ...step, position: { x: 0, y: index * ROW } })
    const previous = spec.before[index - 1]
    if (previous) edges.push({ id: `e-before-${index}`, from: previous.id, to: step.id })
  })

  const branchTop = spec.before.length * ROW
  const centre = (spec.branches.length - 1) / 2
  let branchDepth = 0

  spec.branches.forEach((branch, branchIndex) => {
    const x = Math.round((branchIndex - centre) * COLUMN)
    branch.forEach((step, stepIndex) => {
      nodes.push({ ...step, position: { x, y: branchTop + stepIndex * ROW } })
      const previous = branch[stepIndex - 1]
      if (previous) {
        edges.push({ id: `e-b${branchIndex}-${stepIndex}`, from: previous.id, to: step.id })
      }
    })
    const head = branch[0]
    const tail = branch[branch.length - 1]
    if (head)
      edges.push({ id: `e-split-${branchIndex}`, from: split.id, to: head.id, kind: 'parallel' })
    if (tail) {
      edges.push({
        id: `e-join-${branchIndex}`,
        from: tail.id,
        to: spec.merge.id,
        kind: 'aggregation',
      })
    }
    branchDepth = Math.max(branchDepth, branch.length)
  })

  const mergeY = branchTop + branchDepth * ROW
  nodes.push({ ...spec.merge, position: { x: 0, y: mergeY } })

  spec.after.forEach((step, index) => {
    nodes.push({ ...step, position: { x: 0, y: mergeY + (index + 1) * ROW } })
    const previous = index === 0 ? spec.merge : spec.after[index - 1]
    if (previous) edges.push({ id: `e-after-${index}`, from: previous.id, to: step.id })
  })

  return { entryNodeId: entry.id, nodes, edges }
}

/**
 * Lay out a linear workflow: one column, 120px apart, one sequential edge between
 * consecutive steps. Positions and edge ids are derived from the order, so the graph is
 * deterministic and a later edit produces a minimal diff.
 */
export function chain(steps: StepSpec[]): Graph {
  const first = steps[0]
  if (!first) throw new Error('chain() needs at least one step')
  const edges: WorkflowEdgeInput[] = []
  for (let index = 1; index < steps.length; index += 1) {
    const from = steps[index - 1]
    const to = steps[index]
    if (from && to) edges.push({ id: `e${index}`, from: from.id, to: to.id })
  }
  return {
    entryNodeId: first.id,
    nodes: steps.map((step, index) => ({ ...step, position: { x: 0, y: index * 120 } })),
    edges,
  }
}
