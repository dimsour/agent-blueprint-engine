/**
 * What one artifact becomes on Claude Code: the pieces both layouts share (P9-27). The
 * project layout writes them under `.claude/`; the plugin layout under `plugins/claude-code/`.
 */
import type { Agent, Blueprint, Rule, Skill } from '@agent-blueprint/core'

import type { Frontmatter } from '../shared/frontmatter'
import { markdownWithFrontmatter } from '../shared/frontmatter'
import { lawsForAgent } from '../shared/instructions'
import type { PermissionDecision, PermissionOperation } from '../shared/permissions'
import { generatedFile, type GeneratedFile } from '../types'
import type { ClaudeCodeOptions } from './options'

export const SKILLS_DIR = '.claude/skills'
export const AGENTS_DIR = '.claude/agents'
export const RULES_DIR = '.claude/rules'
export const REFERENCES_DIR = '.claude/references'

function modelFor(agent: Agent): string | undefined {
  if (agent.model?.hint) return agent.model.hint
  const preference = agent.model?.preference
  if (preference === undefined) return undefined
  switch (preference) {
    case 'fast':
      return 'haiku'
    case 'balanced':
      return 'sonnet'
    case 'strong':
      return 'opus'
  }
}

/** Claude tool names an agent may use, derived from the tool kinds it was given. */
export function toolNames(toolIds: readonly string[], blueprint: Blueprint): string[] {
  const names = new Set<string>()
  for (const toolId of toolIds) {
    const tool = blueprint.tools.find((candidate) => candidate.id === toolId)
    if (!tool) continue
    if (tool.mcp) {
      names.add(`mcp__${tool.id}`)
      continue
    }
    switch (tool.kind) {
      case 'filesystem':
        for (const name of ['Read', 'Write', 'Edit', 'Glob', 'Grep']) names.add(name)
        break
      case 'shell':
      case 'git':
      case 'database':
        names.add('Bash')
        break
      case 'browser':
      case 'api':
      case 'documentation':
        names.add('WebFetch')
        break
      case 'search':
        names.add('WebSearch')
        names.add('Grep')
        break
      case 'mcp':
        names.add(`mcp__${tool.id}`)
        break
      case 'custom':
        break
    }
  }
  return [...names].sort()
}

/** The Claude tools an operation goes through; MCP servers are resolved per Blueprint. */
export const TOOLS_BEHIND_OPERATION: Record<Exclude<PermissionOperation, 'mcp'>, string[]> = {
  'fs.read': ['Read', 'Glob', 'Grep'],
  'fs.write': ['Edit', 'Write', 'NotebookEdit'],
  'fs.delete': ['Bash'],
  'shell.readonly': ['Bash'],
  'shell.mutating': ['Bash'],
  'git.read': ['Bash'],
  'git.commit': ['Bash'],
  'git.push': ['Bash'],
  'git.force-push': ['Bash'],
  'net.docs': ['WebFetch'],
  'net.any': ['WebFetch', 'WebSearch'],
}

/**
 * What a subagent's denied operations turn off, and what they cannot (P9-26).
 *
 * A subagent has no permission lists of its own; it has `tools` and `disallowedTools`, and
 * those name whole tools. A tool is turned off only when every operation behind it that the
 * agent decides is denied: denying `git.push` while allowing `git.read` still needs `Bash`.
 * The denials that survive that way are returned as `kept`, so the agent file can say them
 * in words — a reviewer that must not push is still told not to.
 */
export function lowerSubagentDenials(
  agent: Agent,
  blueprint: Blueprint,
): { disallowed: string[]; kept: PermissionOperation[] } {
  const toolsBehind = (operation: PermissionOperation): string[] =>
    operation === 'mcp'
      ? blueprint.tools.filter((tool) => tool.mcp).map((tool) => `mcp__${tool.id}`)
      : TOOLS_BEHIND_OPERATION[operation]

  const denied = new Set<string>()
  const survives = new Set<string>()
  const entries = Object.entries(agent.permissions.operations) as [
    PermissionOperation,
    PermissionDecision,
  ][]
  for (const [operation, decision] of entries) {
    for (const tool of toolsBehind(operation)) {
      if (decision === 'deny') denied.add(tool)
      else survives.add(tool)
    }
  }

  const disallowed = [...denied].filter((tool) => !survives.has(tool)).sort()
  const kept = entries
    .filter(
      ([operation, decision]) =>
        decision === 'deny' && toolsBehind(operation).some((tool) => !disallowed.includes(tool)),
    )
    .map(([operation]) => operation)
  return { disallowed, kept }
}

/** One line per denial the subagent has to honour by itself. */
const DENIAL_LINES: Record<PermissionOperation, string> = {
  'fs.read': 'Never read files.',
  'fs.write': 'Never create or edit files.',
  'fs.delete': 'Never delete files.',
  'shell.readonly': 'Never run shell commands, not even read-only ones.',
  'shell.mutating': 'Never run a shell command that changes anything.',
  'git.read': 'Never read git history.',
  'git.commit': 'Never commit.',
  'git.push': 'Never push to a remote.',
  'git.force-push': 'Never force-push or rewrite shared history.',
  'net.docs': 'Never fetch documentation from the network.',
  'net.any': 'Never reach the network.',
  mcp: 'Never use an MCP server.',
}

export function permissionModeFor(agent: Agent, options: ClaudeCodeOptions): string | undefined {
  if (options.permissionMode) return options.permissionMode
  const decisions = Object.values(agent.permissions.operations)
  if (decisions.length === 0) return undefined
  if (decisions.every((decision) => decision === 'allow')) return 'acceptEdits'
  return 'default'
}

export function ruleFile(rule: Rule): GeneratedFile {
  const frontmatter: Frontmatter = {
    description: rule.description ?? rule.guidance,
    paths: rule.paths,
  }
  const body = [`# ${rule.name}`, rule.guidance, rule.body].filter(Boolean).join('\n\n')
  return generatedFile(
    `${RULES_DIR}/${rule.id}.md`,
    markdownWithFrontmatter(frontmatter, body, `blueprint/rules/${rule.id}.md`),
    'markdown',
    'claude-code',
    [{ kind: 'rule', id: rule.id }],
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
  options: ClaudeCodeOptions,
  where: AgentFileOptions = PROJECT_AGENT_FILES,
): GeneratedFile {
  const laws = lawsForAgent(blueprint, agent.id).filter((law) => where.allLaws || !law.scope.all)
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

  // Denied operations turn whole tools off where they can (P9-26). Where they cannot —
  // pushing is denied but the shell is not — the agent is told, since nothing else will.
  const denials = lowerSubagentDenials(agent, blueprint)
  if (denials.kept.length > 0) {
    sections.push(
      ['## Not allowed', ...denials.kept.map((operation) => `- ${DENIAL_LINES[operation]}`)].join(
        '\n',
      ),
    )
  }

  // A tool list is a whitelist: an agent that delegates needs the Agent tool on it, or the
  // list silently takes delegation away. Naming the delegates keeps it to them.
  const delegates = agent.delegation?.canDelegateTo ?? []
  const tools = [
    ...toolNames(agent.toolIds, blueprint).filter((tool) => !denials.disallowed.includes(tool)),
    ...(agent.toolIds.length > 0 && delegates.length > 0 ? [`Agent(${delegates.join(', ')})`] : []),
  ]

  const frontmatter: Frontmatter = {
    name: agent.id,
    description: agent.description ?? agent.responsibilities.join('; '),
    ...(tools.length > 0 ? { tools } : {}),
    ...(denials.disallowed.length > 0 ? { disallowedTools: denials.disallowed } : {}),
    ...(modelFor(agent) ? { model: modelFor(agent) } : {}),
    ...(agent.budget?.effort ? { effort: agent.budget.effort } : {}),
    ...(agent.budget?.maxTurns ? { maxTurns: agent.budget.maxTurns } : {}),
    ...(agent.skillIds.length > 0 ? { skills: [...agent.skillIds] } : {}),
    ...(permissionModeFor(agent, options)
      ? { permissionMode: permissionModeFor(agent, options) }
      : {}),
    ...(agent.memoryIds.length > 0 ? { memory: 'project' } : {}),
  }

  return generatedFile(
    `${where.root}/${agent.id}.md`,
    markdownWithFrontmatter(
      frontmatter,
      sections.filter((section) => section.trim().length > 0).join('\n\n'),
      `blueprint/agents/${agent.id}.md`,
    ),
    'markdown',
    'claude-code',
    [{ kind: 'agent', id: agent.id }],
  )
}

export function skillFrontmatter(skill: Skill): Frontmatter {
  const paths = [...skill.activation.filePatterns, ...skill.activation.directories]
  const whenToUse = [
    skill.whenToUse,
    skill.activation.intents.length > 0
      ? `Triggered by requests like ${skill.activation.intents.map((intent) => `"${intent}"`).join(', ')}.`
      : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    ...(whenToUse ? { when_to_use: whenToUse } : {}),
    ...(paths.length > 0 ? { paths } : {}),
    // A knowledge skill the model applies on its own stays out of the slash-command menu.
    ...(skill.invocation.userInvocable ? {} : { 'user-invocable': false }),
    ...(skill.invocation.argumentHint ? { 'argument-hint': skill.invocation.argumentHint } : {}),
  }
}
