import { ENTITY_KINDS } from '../model/kinds'
import type { Blueprint } from '../model/types'
import { blueprintSchema, PERMISSION_OPERATIONS } from '../schema/index'
import { getCollection } from './entities'

/** LF line endings, no trailing whitespace on any line, no trailing blank lines. */
export function normalizeMarkdown(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
}

function normalizeText(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  const trimmed = text.replace(/\r\n?/g, '\n').trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Parse + canonicalize a Blueprint.
 *
 * Applies schema defaults, normalizes Markdown bodies, removes duplicate ids from reference
 * lists, sorts lists whose order carries no meaning (tags, metadata keys, workflow nodes and
 * edges) and leaves lists whose order is meaningful (collections, an agent's skills) alone.
 * Idempotent: `normalizeBlueprint(normalizeBlueprint(x))` deep-equals `normalizeBlueprint(x)`.
 */
export function normalizeBlueprint(input: unknown): Blueprint {
  const bp = blueprintSchema.parse(input)

  const header: Blueprint = { ...bp }
  const blueprintDescription = normalizeText(bp.description)
  if (blueprintDescription === undefined) delete header.description
  else header.description = blueprintDescription

  for (const kind of ENTITY_KINDS) {
    for (const entity of getCollection(header, kind)) {
      const record = entity as Record<string, unknown>
      const description = normalizeText(entity.description)
      if (description === undefined) delete record.description
      else record.description = description
      if (typeof record.body === 'string') record.body = normalizeMarkdown(record.body)
      entity.tags = dedupe(entity.tags).sort()
      entity.metadata = sortedRecord(entity.metadata)
    }
  }

  for (const agent of header.agents) {
    agent.skillIds = dedupe(agent.skillIds)
    agent.workflowIds = dedupe(agent.workflowIds)
    agent.ironLawIds = dedupe(agent.ironLawIds)
    agent.ruleIds = dedupe(agent.ruleIds)
    agent.toolIds = dedupe(agent.toolIds)
    agent.referenceIds = dedupe(agent.referenceIds)
    agent.memoryIds = dedupe(agent.memoryIds)
    if (agent.delegation) agent.delegation.canDelegateTo = dedupe(agent.delegation.canDelegateTo)
    agent.permissions.operations = Object.fromEntries(
      PERMISSION_OPERATIONS.filter((op) => op in agent.permissions.operations).map((op) => [
        op,
        agent.permissions.operations[op],
      ]),
    )
  }

  for (const skill of bp.skills) {
    skill.referenceIds = dedupe(skill.referenceIds)
    skill.allowedToolIds = dedupe(skill.allowedToolIds)
    skill.activation.workflowIds = dedupe(skill.activation.workflowIds)
    skill.resources = [...skill.resources].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    )
    for (const resource of skill.resources) resource.content = normalizeMarkdown(resource.content)
  }

  for (const workflow of bp.workflows) {
    workflow.nodes = [...workflow.nodes].sort(byId)
    workflow.edges = [...workflow.edges].sort(byId)
    workflow.triggers.agentIds = dedupe(workflow.triggers.agentIds)
  }

  for (const law of bp.ironLaws) {
    law.scope.agentIds = dedupe(law.scope.agentIds)
    law.scope.workflowIds = dedupe(law.scope.workflowIds)
    law.enforcement = dedupe(law.enforcement)
  }

  for (const rule of bp.rules) {
    rule.scope.agentIds = dedupe(rule.scope.agentIds)
    rule.scope.workflowIds = dedupe(rule.scope.workflowIds)
  }

  return header
}
