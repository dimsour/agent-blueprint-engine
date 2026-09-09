/**
 * What a workflow's steps and connections are called, and what colour they are.
 *
 * Kept apart from the editing functions because those reach the layout engine, and the step
 * panel wants only these names: importing them should not pull a megabyte of layout code in
 * behind them.
 */
import type { WORKFLOW_EDGE_KINDS, WORKFLOW_NODE_TYPES } from '@agent-blueprint/core'

import { hueColor, KIND_HUE } from '@/lib/graph/overview'

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
 * blue-ish, checks are green, control flow is amber, and the ends are neutral. Where a step
 * type names an artifact kind, it borrows that kind's hue, so a gate is the same colour in
 * the overview graph and in this palette.
 */
export const NODE_TYPE_INFO: Record<NodeType, NodeTypeInfo> = {
  start: { label: 'Start', hint: 'Where the workflow begins', hue: 250 },
  end: { label: 'End', hint: 'Where it finishes', hue: 250 },
  agent: {
    label: 'Agent',
    hint: 'An agent does the work',
    hue: KIND_HUE.agent,
    refField: 'agentId',
  },
  skill: { label: 'Skill', hint: 'Apply a skill', hue: KIND_HUE.skill, refField: 'skillId' },
  tool: { label: 'Tool', hint: 'Use a tool', hue: KIND_HUE.tool, refField: 'toolId' },
  condition: { label: 'Condition', hint: 'Branch on a question', hue: 60 },
  verification: { label: 'Verification', hint: 'Prove it worked', hue: 150 },
  review: { label: 'Review', hint: 'Another pass over the work', hue: 170 },
  gate: {
    label: 'Gate',
    hint: 'A checkpoint that can stop it',
    hue: KIND_HUE.gate,
    refField: 'gateId',
  },
  'human-approval': { label: 'Human approval', hint: 'Ask a person', hue: 320 },
  output: { label: 'Output', hint: 'Produce the result', hue: 230 },
  parallel: { label: 'Parallel', hint: 'Split into branches', hue: 45 },
  merge: { label: 'Merge', hint: 'Bring the branches back', hue: 45 },
  retry: { label: 'Retry', hint: 'Try again, up to a limit', hue: 30 },
  delegate: {
    label: 'Delegate',
    hint: 'Hand off to another agent',
    hue: KIND_HUE.memory,
    refField: 'agentId',
  },
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
  return hueColor(NODE_TYPE_INFO[type].hue)
}

/** Node box used for layout, matched by the CSS so edges meet the boxes they connect. */
export const WORKFLOW_NODE_SIZE = { width: 190, height: 52 } as const
