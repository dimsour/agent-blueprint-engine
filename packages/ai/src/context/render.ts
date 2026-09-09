/**
 * How a Blueprint is described to a model.
 *
 * An artifact is shown the way it is stored: YAML frontmatter and a Markdown body, exactly
 * the file `writeProject` would produce. That is not decoration. The model is being asked to
 * write these fields back, and showing it the real file is the shortest path between what it
 * reads and what it must produce — no second vocabulary to keep in step with the schemas.
 *
 * Everything else is a summary: an id, a name and one line, because a model choosing which
 * skill an agent should use does not need the skill's body, and spending the budget on bodies
 * is how the selected artifact ends up truncated instead.
 */
import {
  type AnyEntity,
  type Blueprint,
  type EntityKind,
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityRef,
  entitySchemaFor,
  getCollection,
  stripDefaults,
  toYaml,
  type Workflow,
} from '@agent-blueprint/core'

import { truncateToTokens } from '../tokens'

/** Bodies of neighbouring artifacts are context, not the subject; this is where they stop. */
export const NEIGHBOUR_BODY_CHARS = 1_500

/** One artifact as its source file: frontmatter, then the body. */
export function renderEntity(
  kind: EntityKind,
  entity: AnyEntity,
  options: { bodyChars?: number } = {},
): string {
  const { body, ...fields } = entity as AnyEntity & { body?: string }
  const stripped = stripDefaults(fields, entitySchemaFor(kind)) as Record<string, unknown>
  const frontmatter = toYaml(stripped).trimEnd()
  const text =
    options.bodyChars !== undefined && body !== undefined && body.length > options.bodyChars
      ? `${body.slice(0, options.bodyChars).trimEnd()}\n[… truncated …]`
      : (body ?? '')
  return [`# ${ENTITY_KIND_INFO[kind].label}: ${entity.id}`, '---', frontmatter, '---', text]
    .join('\n')
    .trimEnd()
}

/** `- id — Name: description` for one artifact. */
export function renderEntityLine(entity: AnyEntity): string {
  const description = (entity as { description?: string }).description
  return `- ${entity.id} — ${entity.name}${description ? `: ${firstLine(description)}` : ''}`
}

/**
 * The whole Blueprint at a glance: what it is, who leads it, and every artifact by id, name
 * and one line. This is the block that makes references possible, so it is never dropped
 * before the bodies are.
 */
export function renderSummary(bp: Blueprint): string {
  const lines: string[] = [
    '# Blueprint',
    `name: ${bp.name}`,
    `version: ${bp.version}`,
    ...(bp.description ? [`description: ${firstLine(bp.description)}`] : []),
    ...(bp.settings.primaryAgentId ? [`primary agent: ${bp.settings.primaryAgentId}`] : []),
    ...(bp.targets.length > 0
      ? [`compile targets: ${bp.targets.map((target) => target.harnessId).join(', ')}`]
      : []),
  ]
  for (const kind of ENTITY_KINDS) {
    const entities = getCollection(bp, kind)
    if (entities.length === 0) continue
    lines.push('', `## ${ENTITY_KIND_INFO[kind].pluralLabel} (${entities.length})`)
    for (const entity of entities) lines.push(renderEntityLine(entity))
  }
  return lines.join('\n')
}

/** Each workflow as its ordered steps, which is what a summary of a graph amounts to. */
export function renderWorkflows(workflows: readonly Workflow[]): string {
  if (workflows.length === 0) return ''
  const lines = ['# Workflow steps']
  for (const workflow of workflows) {
    lines.push('', `## ${workflow.id}`)
    for (const node of orderedNodes(workflow)) {
      const next = workflow.edges
        .filter((edge) => edge.from === node.id)
        .map((edge) => `${edge.to}${edge.kind === 'sequential' ? '' : ` (${edge.kind})`}`)
      lines.push(
        `- ${node.id} [${node.type}] ${node.label}${next.length > 0 ? ` → ${next.join(', ')}` : ''}`,
      )
    }
  }
  return lines.join('\n')
}

/**
 * Steps in the order the workflow runs them, as far as the edges say: breadth-first from the
 * entry point, then whatever the edges never reach, so an unreachable step is still shown.
 */
function orderedNodes(workflow: Workflow): Workflow['nodes'] {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]))
  const ordered: Workflow['nodes'] = []
  const seen = new Set<string>()
  const queue = workflow.entryNodeId ? [workflow.entryNodeId] : []
  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (!node) continue
    ordered.push(node)
    for (const edge of workflow.edges) if (edge.from === id) queue.push(edge.to)
  }
  for (const node of workflow.nodes) if (!seen.has(node.id)) ordered.push(node)
  return ordered
}

export function renderRef(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`
}

/** Cut text to a token count, for callers assembling their own blocks. */
export function clampToTokens(text: string, tokens: number): string {
  return truncateToTokens(text, tokens)
}

function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? ''
  return line.length > 200 ? `${line.slice(0, 200)}…` : line
}
