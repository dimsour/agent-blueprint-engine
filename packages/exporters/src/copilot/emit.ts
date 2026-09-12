/**
 * What one artifact becomes on Copilot: the pieces both layouts share (P9-36). The project
 * layout writes them under `.github/`; the plugin layout under `plugins/copilot/`.
 */
import type { Agent, Blueprint, Rule } from '@agent-blueprint/core'

import { type Frontmatter, markdownWithFrontmatter } from '../shared/frontmatter'
import { lawsForAgent, primaryAgentOf } from '../shared/instructions'
import { type CompatibilityIssue, generatedFile, type GeneratedFile } from '../types'
import { toolAliases } from './settings'

export const AGENTS_DIR = '.github/agents'
export const INSTRUCTIONS_DIR = '.github/instructions'

/** Copilot caps a custom agent body. */
export const AGENT_BODY_MAX_CHARS = 30_000

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'copilot', concept, support, message, ...extra })

export function describe(agent: Agent): string {
  return agent.description ?? agent.responsibilities.join('; ')
}

/**
 * The persona, plus the parts of the Blueprint that only apply to this agent — or every law
 * that binds it, for a layout with no root instruction file.
 */
export function agentBody(agent: Agent, blueprint: Blueprint, allLaws = false): string {
  const laws = lawsForAgent(blueprint, agent.id).filter((law) => allLaws || !law.scope.all)
  const sections = [agent.body]
  if (agent.responsibilities.length > 0) {
    sections.push(
      ['## Responsibilities', ...agent.responsibilities.map((item) => `- ${item}`)].join('\n'),
    )
  }
  if (agent.outputRequirements.length > 0) {
    sections.push(
      ['## Output requirements', ...agent.outputRequirements.map((item) => `- ${item}`)].join('\n'),
    )
  }
  if (laws.length > 0) {
    sections.push(
      ['## Iron Laws', ...laws.map((law) => `- **${law.name}.** ${law.rule}`)].join('\n'),
    )
  }
  return sections.filter((section) => section.trim().length > 0).join('\n\n')
}

/** Delegation targets that have an agent file of their own to hand off to. */
export function delegatesOf(
  agent: Agent,
  blueprint: Blueprint,
  primaryId: string | undefined,
): string[] {
  return (agent.delegation?.canDelegateTo ?? []).filter(
    (id) => id !== primaryId && blueprint.agents.some((candidate) => candidate.id === id),
  )
}

export interface AgentFileOptions {
  /** Directory the agent files go in. */
  root: string
  /** Carry the laws that apply to every agent too — for a layout with no root instruction file. */
  allLaws: boolean
}

export const PROJECT_AGENT_FILES: AgentFileOptions = { root: AGENTS_DIR, allLaws: false }

export function agentFile(
  agent: Agent,
  blueprint: Blueprint,
  primaryId: string | undefined,
  where: AgentFileOptions = PROJECT_AGENT_FILES,
): GeneratedFile {
  const delegates = delegatesOf(agent, blueprint, primaryId)
  const tools = toolAliases(agent, blueprint.tools, delegates.length)
  const frontmatter: Frontmatter = {
    name: agent.id,
    description: describe(agent),
    ...(tools.length > 0 ? { tools } : {}),
    ...(agent.model?.hint ? { model: agent.model.hint } : {}),
    ...(delegates.length > 0 ? { agents: delegates } : {}),
    'user-invocable': true,
  }
  return generatedFile(
    `${where.root}/${agent.id}.agent.md`,
    markdownWithFrontmatter(
      frontmatter,
      agentBody(agent, blueprint, where.allLaws),
      `blueprint/agents/${agent.id}.md`,
    ),
    'markdown',
    'copilot',
    [{ kind: 'agent', id: agent.id }],
  )
}

/** A rule with paths as a path-scoped instruction file. */
export function instructionFile(rule: Rule, dir = INSTRUCTIONS_DIR): GeneratedFile {
  const frontmatter: Frontmatter = {
    name: rule.name,
    description: rule.description ?? rule.guidance,
    // Several globs are one comma-separated value, not a list.
    applyTo: rule.paths.join(', '),
  }
  const body = [`# ${rule.name}`, rule.guidance, rule.body].filter(Boolean).join('\n\n')
  return generatedFile(
    `${dir}/${rule.id}.instructions.md`,
    markdownWithFrontmatter(frontmatter, body, `blueprint/rules/${rule.id}.md`),
    'markdown',
    'copilot',
    [{ kind: 'rule', id: rule.id }],
  )
}

/**
 * What Copilot's agent model cannot express whichever layout is written: per-command
 * permission patterns, model tiers, and delegation to or from the primary agent, which has
 * no agent file of its own.
 */
export function agentIssues(blueprint: Blueprint, policyLocation: string): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = []
  const primary = primaryAgentOf(blueprint)
  const subagents = blueprint.agents.filter((agent) => agent.id !== primary?.id)

  const withPatterns = blueprint.agents.filter((agent) => agent.permissions.patterns.length > 0)
  for (const agent of withPatterns) {
    issues.push(
      issue(
        'permissions',
        'limited',
        `A Copilot allowlist names tool categories, not commands, so the ${agent.permissions.patterns.length} per-command rule(s) on "${agent.name}" cannot be enforced. They are written into ${policyLocation} as a command policy the agent is told to follow.`,
        {
          ref: { kind: 'agent', id: agent.id },
          adaptation: `${policyLocation} "Command policy" section`,
        },
      ),
    )
  }

  const preferenceOnly = blueprint.agents.filter(
    (agent) => agent.model?.preference && !agent.model.hint,
  )
  if (preferenceOnly.length > 0) {
    issues.push(
      issue(
        'agents',
        'limited',
        `Copilot names a model explicitly and has no fast, balanced or strong tier, so the model preference on ${preferenceOnly.length} agent(s) is left to whichever model the user has picked.`,
      ),
    )
  }

  if (primary && delegatesOf(primary, blueprint, undefined).length > 0) {
    issues.push(
      issue(
        'agents',
        'adapted',
        `The primary agent is ${policyLocation} rather than a custom agent file, so "${primary.name}" cannot declare its handoffs in frontmatter. The agents it delegates to are named in the roster there and in each workflow.`,
        { ref: { kind: 'agent', id: primary.id } },
      ),
    )
  }
  for (const agent of subagents) {
    const dropped = (agent.delegation?.canDelegateTo ?? []).filter(
      (id) => id === primary?.id && primary !== undefined,
    )
    if (dropped.length > 0) {
      issues.push(
        issue(
          'agents',
          'limited',
          `"${agent.name}" may delegate back to the primary agent, which has no custom agent file to hand off to. On Copilot it returns to the main session instead.`,
          { ref: { kind: 'agent', id: agent.id } },
        ),
      )
    }
  }

  return issues
}
