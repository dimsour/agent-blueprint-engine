/**
 * Structural rules: the Blueprint is well-formed as a data structure. Semantic rules
 * (unreachable nodes, missing verification, contradictions, orphans) and requirement checks
 * are roadmap phase P1 and live in sibling files.
 */
import { getCollection } from '../../blueprint/entities'
import { isSlug } from '../../model/ids'
import { ENTITY_KIND_INFO, ENTITY_KINDS } from '../../model/kinds'
import { isEntitySource } from '../../model/refs'
import { SKILL_DESCRIPTION_MAX_LENGTH } from '../../schema/skill'
import type { ValidationRule } from '../engine'
import type { Diagnostic } from '../types'

const label = (kind: keyof typeof ENTITY_KIND_INFO) => ENTITY_KIND_INFO[kind].label

export const duplicateIds: ValidationRule = {
  code: 'BP-ID-001',
  description: 'Entity ids must be unique within their kind.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const kind of ENTITY_KINDS) {
      const seen = new Set<string>()
      for (const entity of getCollection(blueprint, kind)) {
        if (seen.has(entity.id)) {
          out.push({
            code: 'BP-ID-001',
            severity: 'error',
            message: `Duplicate ${label(kind).toLowerCase()} id "${entity.id}".`,
            ref: { kind, id: entity.id },
          })
        }
        seen.add(entity.id)
      }
    }
    return out
  },
}

export const invalidIds: ValidationRule = {
  code: 'BP-ID-002',
  description: 'Entity ids must be valid slugs.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const kind of ENTITY_KINDS) {
      for (const entity of getCollection(blueprint, kind)) {
        if (!isSlug(entity.id)) {
          out.push({
            code: 'BP-ID-002',
            severity: 'error',
            message: `${label(kind)} id "${entity.id}" is not a valid slug (lowercase letters, digits, single hyphens, max 64 chars).`,
            ref: { kind, id: entity.id },
          })
        }
      }
    }
    return out
  },
}

export const danglingReferences: ValidationRule = {
  code: 'BP-REF-001',
  description: 'Every reference must point to an existing entity.',
  check({ graph, blueprint }) {
    return graph.dangling.map((edge): Diagnostic => {
      const source = isEntitySource(edge.from) && edge.from.id !== '' ? edge.from : undefined
      const owner = source ? `${label(source.kind)} "${source.id}"` : `Blueprint "${blueprint.id}"`
      return {
        code: 'BP-REF-001',
        severity: 'error',
        message: `${owner} references unknown ${label(edge.to.kind).toLowerCase()} "${edge.to.id}" (${edge.relation}).`,
        ...(source ? { ref: source } : {}),
        related: [edge.to],
        data: { relation: edge.relation },
      }
    })
  },
}

const DESCRIBED_KINDS = ['agent', 'skill', 'workflow', 'iron-law', 'gate', 'hook'] as const

export const missingDescriptions: ValidationRule = {
  code: 'BP-DESC-001',
  description: 'Agents, skills, workflows, iron laws, gates and hooks should have a description.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const kind of DESCRIBED_KINDS) {
      for (const entity of getCollection(blueprint, kind)) {
        if (!entity.description) {
          out.push({
            code: 'BP-DESC-001',
            severity: 'warning',
            message: `${label(kind)} "${entity.name}" has no description.`,
            ref: { kind, id: entity.id },
          })
        }
      }
    }
    return out
  },
}

export const agentResponsibilities: ValidationRule = {
  code: 'BP-AGENT-001',
  description: 'An agent should state its responsibilities.',
  check({ blueprint }) {
    return blueprint.agents
      .filter((agent) => agent.responsibilities.length === 0)
      .map((agent) => ({
        code: 'BP-AGENT-001',
        severity: 'warning' as const,
        message: `Agent "${agent.name}" has no responsibilities.`,
        ref: { kind: 'agent' as const, id: agent.id },
      }))
  },
}

export const primaryAgent: ValidationRule = {
  code: 'BP-AGENT-002',
  description: 'A Blueprint with several agents must designate a primary agent.',
  check({ blueprint }) {
    if (blueprint.agents.length <= 1 || blueprint.settings.primaryAgentId) return []
    return [
      {
        code: 'BP-AGENT-002',
        severity: 'warning',
        message: `The Blueprint has ${blueprint.agents.length} agents but no primary agent; compiled root instructions will use the first agent.`,
      },
    ]
  },
}

export const workflowStructure: ValidationRule = {
  code: 'BP-WF-001',
  description:
    'Workflows need a start node as entry point, an end node, unique node ids and edges between known nodes.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const workflow of blueprint.workflows) {
      const ref = { kind: 'workflow' as const, id: workflow.id }
      const nodeIds = new Set<string>()
      for (const node of workflow.nodes) {
        if (nodeIds.has(node.id)) {
          out.push({
            code: 'BP-WF-004',
            severity: 'error',
            message: `Workflow "${workflow.name}" has duplicate node id "${node.id}".`,
            ref,
          })
        }
        nodeIds.add(node.id)
      }

      const starts = workflow.nodes.filter((n) => n.type === 'start')
      const entry = workflow.entryNodeId
        ? workflow.nodes.find((n) => n.id === workflow.entryNodeId)
        : undefined
      if (workflow.nodes.length === 0) {
        out.push({
          code: 'BP-WF-001',
          severity: 'error',
          message: `Workflow "${workflow.name}" has no nodes.`,
          ref,
        })
      } else if (!entry) {
        out.push({
          code: 'BP-WF-001',
          severity: 'error',
          message: workflow.entryNodeId
            ? `Workflow "${workflow.name}" entry node "${workflow.entryNodeId}" does not exist.`
            : `Workflow "${workflow.name}" has no entry node${starts.length > 0 ? ` (set entryNodeId to "${starts[0]?.id ?? ''}")` : ''}.`,
          ref,
        })
      } else if (entry.type !== 'start') {
        out.push({
          code: 'BP-WF-001',
          severity: 'error',
          message: `Workflow "${workflow.name}" entry node "${entry.id}" is a ${entry.type} node, not a start node.`,
          ref,
        })
      }

      if (workflow.nodes.length > 0 && !workflow.nodes.some((n) => n.type === 'end')) {
        out.push({
          code: 'BP-WF-002',
          severity: 'warning',
          message: `Workflow "${workflow.name}" has no end node.`,
          ref,
        })
      }

      for (const edge of workflow.edges) {
        for (const endpoint of [edge.from, edge.to]) {
          if (!nodeIds.has(endpoint)) {
            out.push({
              code: 'BP-WF-003',
              severity: 'error',
              message: `Workflow "${workflow.name}" edge "${edge.id}" references unknown node "${endpoint}".`,
              ref,
            })
          }
        }
      }

      for (const node of workflow.nodes) {
        const missing =
          (node.type === 'agent' || node.type === 'delegate') && !node.config.agentId
            ? 'an agent'
            : node.type === 'skill' && !node.config.skillId
              ? 'a skill'
              : node.type === 'gate' && !node.config.gateId
                ? 'a gate'
                : node.type === 'tool' && !node.config.toolId
                  ? 'a tool'
                  : undefined
        if (missing) {
          out.push({
            code: 'BP-WF-005',
            severity: 'warning',
            message: `Workflow "${workflow.name}" node "${node.label}" (${node.type}) has no ${missing.slice(2)} assigned.`,
            ref,
            data: { nodeId: node.id },
          })
        }
      }
    }
    return out
  },
}

export const skillSpecLimits: ValidationRule = {
  code: 'BP-SKILL-001',
  description: `Skill descriptions must stay within the Agent Skills limit of ${SKILL_DESCRIPTION_MAX_LENGTH} characters.`,
  check({ blueprint }) {
    return blueprint.skills
      .filter((skill) => (skill.description?.length ?? 0) > SKILL_DESCRIPTION_MAX_LENGTH)
      .map((skill) => ({
        code: 'BP-SKILL-001',
        severity: 'warning' as const,
        message: `Skill "${skill.name}" description is ${skill.description?.length ?? 0} characters; harnesses truncate beyond ${SKILL_DESCRIPTION_MAX_LENGTH}.`,
        ref: { kind: 'skill' as const, id: skill.id },
      }))
  },
}

export const targets: ValidationRule = {
  code: 'BP-TARGET-001',
  description: 'At least one export target should be enabled, and each harness at most once.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    if (!blueprint.targets.some((t) => t.enabled)) {
      out.push({
        code: 'BP-TARGET-001',
        severity: 'info',
        message: 'No export target is enabled; nothing will be compiled.',
      })
    }
    const seen = new Set<string>()
    for (const target of blueprint.targets) {
      if (seen.has(target.harnessId)) {
        out.push({
          code: 'BP-TARGET-002',
          severity: 'error',
          message: `Target "${target.harnessId}" is configured more than once.`,
        })
      }
      seen.add(target.harnessId)
    }
    return out
  },
}

export const governanceScope: ValidationRule = {
  code: 'BP-LAW-001',
  description: 'A scoped iron law or rule must list at least one agent or workflow.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const kind of ['iron-law', 'rule'] as const) {
      for (const entity of getCollection(blueprint, kind)) {
        const scope = entity.scope
        if (!scope.all && scope.agentIds.length === 0 && scope.workflowIds.length === 0) {
          out.push({
            code: 'BP-LAW-001',
            severity: 'warning',
            message: `${label(kind)} "${entity.name}" is scoped (all: false) but lists no agents or workflows, so it applies to nothing.`,
            ref: { kind, id: entity.id },
          })
        }
      }
    }
    return out
  },
}

export const STRUCTURAL_RULES: readonly ValidationRule[] = [
  duplicateIds,
  invalidIds,
  danglingReferences,
  missingDescriptions,
  agentResponsibilities,
  primaryAgent,
  workflowStructure,
  skillSpecLimits,
  targets,
  governanceScope,
]
