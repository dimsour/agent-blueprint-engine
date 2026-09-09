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
