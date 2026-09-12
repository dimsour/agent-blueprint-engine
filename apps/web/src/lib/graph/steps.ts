/**
 * What a workflow's steps and connections are called, and what colour they are.
 *
 * Kept apart from the editing functions because those reach the layout engine, and the step
 * panel wants only these names: importing them should not pull a megabyte of layout code in
 * behind them.
 */
import {
  WORKFLOW_EDGE_KIND_INFO,
  type WORKFLOW_EDGE_KINDS,
  WORKFLOW_NODE_TYPE_INFO,
  type WORKFLOW_NODE_TYPES,
} from '@agent-blueprint/core'

import { hueColor, KIND_HUE } from '@/lib/graph/overview'

export type NodeType = (typeof WORKFLOW_NODE_TYPES)[number]
export type EdgeKind = (typeof WORKFLOW_EDGE_KINDS)[number]

export interface NodeTypeInfo {
  label: string
  hue: number
  /** Which artifact, if any, this type of step points at. */
  refField?: 'agentId' | 'skillId' | 'toolId' | 'gateId'
}

/**
 * The sixteen step types, with the wording the palette uses. The hue groups them: work is
 * blue-ish, checks are green, control flow is amber, and the ends are neutral. Where a step
 * type names an artifact kind, it borrows that kind's hue, so a gate is the same colour in
 * the overview graph and in this palette.
 */
export const NODE_TYPE_INFO: Record<NodeType, NodeTypeInfo> = {
  start: { label: 'Start', hue: 250 },
  end: { label: 'End', hue: 250 },
  agent: {
    label: 'Agent',
    hue: KIND_HUE.agent,
    refField: 'agentId',
  },
  skill: { label: 'Skill', hue: KIND_HUE.skill, refField: 'skillId' },
  tool: { label: 'Tool', hue: KIND_HUE.tool, refField: 'toolId' },
  condition: { label: 'Condition', hue: 60 },
  verification: { label: 'Verification', hue: 150 },
  review: { label: 'Review', hue: 170 },
  gate: {
    label: 'Gate',
    hue: KIND_HUE.gate,
    refField: 'gateId',
  },
  'human-approval': { label: 'Human approval', hue: 320 },
  output: { label: 'Output', hue: 230 },
  parallel: { label: 'Parallel', hue: 45 },
  merge: { label: 'Merge', hue: 45 },
  retry: { label: 'Retry', hue: 30 },
  delegate: {
    label: 'Delegate',
    hue: KIND_HUE.memory,
    refField: 'agentId',
  },
  synthesis: { label: 'Synthesis', hue: 210 },
}

export interface EdgeKindInfo {
  label: string
  dashed: boolean
}

export const EDGE_KIND_INFO: Record<EdgeKind, EdgeKindInfo> = {
  sequential: { label: 'Then', dashed: false },
  parallel: { label: 'In parallel', dashed: false },
  conditional: { label: 'If', dashed: true },
  fallback: { label: 'Otherwise', dashed: true },
  retry: { label: 'Retry', dashed: true },
  delegation: { label: 'Delegates to', dashed: false },
  review: { label: 'For review', dashed: false },
  aggregation: { label: 'Collects into', dashed: false },
}

/**
 * What a step does, for the palette's tooltip. From the core option table, which is also what
 * the form's step-type select shows and what docs/02 lists (P9-21); the graph keeps its own
 * short labels because "Then" and "If" read better on a canvas than "Sequential".
 */
export function nodeHint(type: NodeType): string {
  return WORKFLOW_NODE_TYPE_INFO[type].description
}

export function edgeHint(kind: EdgeKind): string {
  return WORKFLOW_EDGE_KIND_INFO[kind].description
}

export function nodeColor(type: NodeType): string {
  return hueColor(NODE_TYPE_INFO[type].hue)
}

/** Node box used for layout, matched by the CSS so edges meet the boxes they connect. */
export const WORKFLOW_NODE_SIZE = { width: 190, height: 52 } as const
