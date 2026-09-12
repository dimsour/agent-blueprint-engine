/**
 * Semantic rules: the Blueprint is well-formed, but does it say something coherent?
 *
 * Structural rules ask "is this a valid data structure". These ask the questions a reviewer
 * would: can this workflow ever finish, does this agent know how to do what it is
 * responsible for, will this skill ever activate, is this law enforced by anything. Every
 * rule is a pure function and every finding names the artifact it is about.
 */
import type { Blueprint, Skill, Workflow } from '../../model/types'
import type { ValidationRule } from '../engine'
import { keywords } from '../text'
import type { Diagnostic } from '../types'
import {
  buildWorkflowGraph,
  findCycles,
  nodesOnCompletePaths,
  reachableFrom,
} from '../workflow-graph'

/** Node types that prove a workflow checks its own work before it finishes. */
const VERIFYING_NODE_TYPES = new Set(['verification', 'gate', 'review', 'human-approval'])

/** Workflows whose entry point is broken are reported by BP-WF-001; skip them here. */
function hasUsableEntry(workflow: Workflow): boolean {
  return (
    workflow.nodes.length > 0 &&
    workflow.entryNodeId !== undefined &&
    workflow.nodes.some((node) => node.id === workflow.entryNodeId)
  )
}

export const unreachableNodes: ValidationRule = {
  code: 'BP-WF-010',
  description: 'Every workflow node should be reachable from the entry node.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const workflow of blueprint.workflows) {
      if (!hasUsableEntry(workflow)) continue
      const graph = buildWorkflowGraph(workflow)
      const reachable = reachableFrom(graph, workflow.entryNodeId ?? '')
      for (const node of workflow.nodes) {
        if (reachable.has(node.id)) continue
        out.push({
          code: 'BP-WF-010',
          severity: 'warning',
          message: `Workflow "${workflow.name}" step "${node.label}" cannot be reached from the entry node, so it will never run.`,
          ref: { kind: 'workflow', id: workflow.id },
          data: { nodeId: node.id },
        })
      }
    }
    return out
  },
}

export const workflowVerification: ValidationRule = {
  code: 'BP-WF-011',
  description: 'A workflow should verify its work before it reports completion.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const workflow of blueprint.workflows) {
      if (!hasUsableEntry(workflow)) continue
      const graph = buildWorkflowGraph(workflow)
      const onPath = nodesOnCompletePaths(graph)
      const verifies = [...onPath].some((nodeId) =>
        VERIFYING_NODE_TYPES.has(graph.nodeById.get(nodeId)?.type ?? ''),
      )
      if (verifies || onPath.size === 0) continue
      out.push({
        code: 'BP-WF-011',
        severity: 'warning',
        message: `Workflow "${workflow.name}" reaches its end without a verification, gate, review or approval step, so nothing checks the result before it is reported as done.`,
        ref: { kind: 'workflow', id: workflow.id },
      })
    }
    return out
  },
}

export const branchArity: ValidationRule = {
  code: 'BP-WF-012',
  description: 'Parallel nodes need at least two branches and merge nodes at least two inputs.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const workflow of blueprint.workflows) {
      const graph = buildWorkflowGraph(workflow)
      for (const node of workflow.nodes) {
        const problem =
          node.type === 'parallel' && graph.outgoing(node.id).length < 2
            ? `has ${graph.outgoing(node.id).length} outgoing branch(es); a parallel step needs at least two`
            : (node.type === 'merge' || node.type === 'synthesis') &&
                graph.incoming(node.id).length < 2
              ? `has ${graph.incoming(node.id).length} incoming branch(es); there is nothing to combine`
              : undefined
        if (problem === undefined) continue
        out.push({
          code: 'BP-WF-012',
          severity: 'warning',
          message: `Workflow "${workflow.name}" step "${node.label}" ${problem}.`,
          ref: { kind: 'workflow', id: workflow.id },
          data: { nodeId: node.id },
        })
      }
    }
    return out
  },
}

export const deadEnds: ValidationRule = {
  code: 'BP-WF-013',
  description: 'Only end nodes may have no outgoing edge.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const workflow of blueprint.workflows) {
      const graph = buildWorkflowGraph(workflow)
      for (const node of workflow.nodes) {
        if (node.type === 'end' || graph.outgoing(node.id).length > 0) continue
        out.push({
          code: 'BP-WF-013',
          severity: 'warning',
          message: `Workflow "${workflow.name}" stops at "${node.label}" without reaching an end step, so the agent is not told what to do next.`,
          ref: { kind: 'workflow', id: workflow.id },
          data: { nodeId: node.id },
        })
      }
    }
    return out
  },
}

export const unboundedCycles: ValidationRule = {
  code: 'BP-WF-014',
  description: 'A loop should be bounded by a retry edge or an attempt limit.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const workflow of blueprint.workflows) {
      const graph = buildWorkflowGraph(workflow)
      for (const cycle of findCycles(graph)) {
        const bounded =
          cycle.edges.some((edge) => edge.kind === 'retry') ||
          cycle.nodeIds.some(
            (nodeId) => graph.nodeById.get(nodeId)?.config.maxAttempts !== undefined,
          )
        if (bounded) continue
        const labels = cycle.nodeIds.map((nodeId) => graph.nodeById.get(nodeId)?.label ?? nodeId)
        out.push({
          code: 'BP-WF-014',
          severity: 'info',
          message: `Workflow "${workflow.name}" loops through ${labels.join(' → ')} with no retry edge or attempt limit, so the compiled instructions do not say when to stop.`,
          ref: { kind: 'workflow', id: workflow.id },
          data: { nodeIds: cycle.nodeIds },
        })
      }
    }
    return out
  },
}

/** Agents a workflow node, another agent's delegation list or the settings point at. */
function referencedAgentIds(blueprint: Blueprint): Set<string> {
  const ids = new Set<string>()
  const primary = blueprint.settings.primaryAgentId ?? blueprint.agents[0]?.id
  if (primary !== undefined) ids.add(primary)
  for (const workflow of blueprint.workflows) {
    for (const node of workflow.nodes) if (node.config.agentId) ids.add(node.config.agentId)
    for (const agentId of workflow.triggers.agentIds) ids.add(agentId)
  }
  for (const agent of blueprint.agents) {
    for (const target of agent.delegation?.canDelegateTo ?? []) ids.add(target)
  }
  return ids
}

export const unusedAgents: ValidationRule = {
  code: 'BP-AGENT-010',
  description: 'Every agent should be reachable: primary, in a workflow, or a delegation target.',
  check({ blueprint }) {
    const referenced = referencedAgentIds(blueprint)
    return blueprint.agents
      .filter((agent) => !referenced.has(agent.id) && agent.workflowIds.length === 0)
      .map((agent) => ({
        code: 'BP-AGENT-010',
        severity: 'warning' as const,
        message: `Agent "${agent.name}" is not the primary agent, runs no workflow and is never delegated to, so nothing will ever invoke it.`,
        ref: { kind: 'agent' as const, id: agent.id },
      }))
  },
}

/** Text of a skill that describes what it is about, for keyword matching. */
function skillTopic(skill: Skill): string {
  return [skill.name, skill.description, skill.whenToUse, ...skill.tags].filter(Boolean).join(' ')
}

export const responsibilitiesWithoutSkills: ValidationRule = {
  code: 'BP-AGENT-011',
  description: 'Each responsibility should be backed by a skill that covers it.',
  check({ blueprint }) {
    const out: Diagnostic[] = []
    for (const agent of blueprint.agents) {
      const skills = agent.skillIds
        .map((skillId) => blueprint.skills.find((skill) => skill.id === skillId))
        .filter((skill): skill is Skill => skill !== undefined)
      const topics = skills.map((skill) => keywords(skillTopic(skill)))

      for (const responsibility of agent.responsibilities) {
        const wanted = keywords(responsibility)
        if (wanted.size === 0) continue
        const covered = topics.some((topic) => [...wanted].some((word) => topic.has(word)))
        if (covered) continue
        out.push({
          code: 'BP-AGENT-011',
          severity: 'warning',
          message: `Agent "${agent.name}" is responsible for "${responsibility}" but none of its skills mention anything like it. Add a skill or attach an existing one.`,
          ref: { kind: 'agent', id: agent.id },
          data: { responsibility },
        })
      }
    }
    return out
  },
}

export const undeclaredPermissions: ValidationRule = {
  code: 'BP-AGENT-012',
  description: 'An agent with tools should say what it may do with them.',
  check({ blueprint }) {
    return blueprint.agents
      .filter(
        (agent) =>
          agent.toolIds.length > 0 &&
          Object.keys(agent.permissions.operations).length === 0 &&
          agent.permissions.patterns.length === 0,
      )
      .map((agent) => ({
        code: 'BP-AGENT-012',
        severity: 'info' as const,
        message: `Agent "${agent.name}" has tools but no permissions, so each harness will apply its own defaults instead of your policy.`,
        ref: { kind: 'agent' as const, id: agent.id },
      }))
  },
}

function hasActivation(skill: Skill): boolean {
  const activation = skill.activation
  return (
    activation.filePatterns.length > 0 ||
    activation.fileTypes.length > 0 ||
    activation.directories.length > 0 ||
    activation.intents.length > 0 ||
    activation.agentRoles.length > 0 ||
    activation.workflowIds.length > 0
  )
}

export const neverActivatedSkills: ValidationRule = {
  code: 'BP-SKILL-010',
  description: 'A skill needs an activation condition or an owner, or it will never be used.',
  check({ blueprint, graph }) {
    return blueprint.skills
      .filter(
        (skill) =>
          !hasActivation(skill) && graph.dependentsOf({ kind: 'skill', id: skill.id }).length === 0,
      )
      .map((skill) => ({
        code: 'BP-SKILL-010',
        severity: 'warning' as const,
        message: `Skill "${skill.name}" has no activation conditions and no agent or workflow uses it, so no harness will ever load it.`,
        ref: { kind: 'skill' as const, id: skill.id },
      }))
  },
}

const VERIFICATION_HEADING_RE = /^#{1,6}\s*(verification|verify|how to verify|checking)\b/im

export const skillsWithoutVerification: ValidationRule = {
  code: 'BP-SKILL-011',
  description: 'A skill should say how to tell whether it was applied correctly.',
  check({ blueprint }) {
    return blueprint.skills
      .filter((skill) => !VERIFICATION_HEADING_RE.test(skill.body))
      .map((skill) => ({
        code: 'BP-SKILL-011',
        severity: 'info' as const,
        message: `Skill "${skill.name}" has no Verification section, so it does not say how to tell whether it was applied correctly.`,
        ref: { kind: 'skill' as const, id: skill.id },
      }))
  },
}

const COMMAND_ACTIONS = new Set(['command', 'run-tests', 'format', 'lint', 'secret-scan'])

export const hooksWithoutCommands: ValidationRule = {
  code: 'BP-HOOK-010',
  description: 'A hook that runs something needs a command or a script to run.',
  check({ blueprint }) {
    return blueprint.hooks
      .filter(
        (hook) =>
          COMMAND_ACTIONS.has(hook.action.type) && !hook.action.command && !hook.action.script,
      )
      .map((hook) => ({
        code: 'BP-HOOK-010',
        severity: 'info' as const,
        message: `Hook "${hook.name}" runs a ${hook.action.type} action but has neither a command nor a script, so nothing will be executed.`,
        ref: { kind: 'hook' as const, id: hook.id },
      }))
  },
}

/** A script is run in place of the command; a hook with both has one that does nothing. */
export const hooksWithCommandAndScript: ValidationRule = {
  code: 'BP-HOOK-011',
  description: 'A hook with a script does not run its command.',
  check({ blueprint }) {
    return blueprint.hooks
      .filter((hook) => Boolean(hook.action.command) && Boolean(hook.action.script))
      .map((hook) => ({
        code: 'BP-HOOK-011',
        severity: 'info' as const,
        message: `Hook "${hook.name}" has both a command and a script. The script is what runs; the command is ignored.`,
        ref: { kind: 'hook' as const, id: hook.id },
      }))
  },
}

export const emptyGates: ValidationRule = {
  code: 'BP-GATE-010',
  description: 'A gate used by a workflow must have at least one criterion.',
  check({ blueprint }) {
    const usedGateIds = new Set(
      blueprint.workflows.flatMap((workflow) =>
        workflow.nodes.map((node) => node.config.gateId).filter((id): id is string => Boolean(id)),
      ),
    )
    return blueprint.gates
      .filter((gate) => usedGateIds.has(gate.id) && gate.criteria.length === 0)
      .map((gate) => ({
        code: 'BP-GATE-010',
        severity: 'warning' as const,
        message: `Gate "${gate.name}" is a checkpoint in a workflow but has no criteria, so it lets everything through.`,
        ref: { kind: 'gate' as const, id: gate.id },
      }))
  },
}

/**
 * Laws that ask to be enforced by a gate need a gate that mentions them. Laws that ask for a
 * hook do not: every adapter generates the check automatically from `enforcement`, so
 * requiring the user to also author a hook would be a false alarm.
 */
export const unenforcedLaws: ValidationRule = {
  code: 'BP-LAW-011',
  description: 'A law enforced by a gate needs a gate that checks it.',
  check({ blueprint }) {
    const gateText = blueprint.gates
      .flatMap((gate) => [
        gate.name,
        gate.description ?? '',
        ...gate.criteria.map((c) => c.description ?? ''),
      ])
      .join(' ')
      .toLowerCase()

    return blueprint.ironLaws
      .filter(
        (law) => law.enforcement.includes('gate') && !gateText.includes(law.name.toLowerCase()),
      )
      .map((law) => ({
        code: 'BP-LAW-011',
        severity: 'info' as const,
        message: `Iron Law "${law.name}" is marked for gate enforcement but no gate mentions it, so nothing blocks progress when it is violated.`,
        ref: { kind: 'iron-law' as const, id: law.id },
      }))
  },
}

/** Agents referenced nowhere are a different question from unused artifacts; see orphans.ts. */
export const SEMANTIC_RULES: readonly ValidationRule[] = [
  unreachableNodes,
  workflowVerification,
  branchArity,
  deadEnds,
  unboundedCycles,
  unusedAgents,
  responsibilitiesWithoutSkills,
  undeclaredPermissions,
  neverActivatedSkills,
  skillsWithoutVerification,
  hooksWithoutCommands,
  hooksWithCommandAndScript,
  emptyGates,
  unenforcedLaws,
]

/** Re-exported for tests and for the evaluator's heuristics. */
export { hasActivation, skillTopic }
