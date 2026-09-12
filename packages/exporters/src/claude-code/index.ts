/**
 * Claude Code adapter.
 *
 * Claude Code has a native primitive for nearly every Blueprint concept, so this adapter is
 * mostly a direct mapping; the one genuinely compiled thing is a workflow, which becomes an
 * orchestration skill. File conventions and field names: docs/harness/claude-code.md.
 */
import type { Agent, Blueprint, Diagnostic, Rule, Skill } from '@agent-blueprint/core'
import { stableJson } from '@agent-blueprint/core'
import { z } from 'zod'

import type { Frontmatter } from '../shared/frontmatter'
import { markdownWithFrontmatter } from '../shared/frontmatter'
import { composeInstructions, lawsForAgent, primaryAgentOf } from '../shared/instructions'
import type { PermissionDecision, PermissionOperation } from '../shared/permissions'
import { CLAUDE_PHRASING } from '../shared/phrasing'
import { emitSkillDir, renderReference } from '../shared/skill-dir'
import { emitWorkflowSkill } from '../shared/workflow-skill'
import {
  type CapabilityMatrix,
  type CompatibilityIssue,
  type CompileResult,
  generatedFile,
  type GeneratedFile,
  type HarnessAdapter,
} from '../types'
import { buildSettings, hookScriptFiles } from './settings'

const SKILLS_DIR = '.claude/skills'
const AGENTS_DIR = '.claude/agents'
const RULES_DIR = '.claude/rules'
const REFERENCES_DIR = '.claude/references'

const optionsSchema = z
  .object({
    /** Overrides the permission mode derived from each agent's permissions. */
    permissionMode: z
      .enum(['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan', 'manual'])
      .optional(),
    /** Set false when the team manages `.claude/settings.json` by hand. */
    emitSettings: z.boolean().default(true),
  })
  .prefault({})

export type ClaudeCodeOptions = z.output<typeof optionsSchema>

const capabilities: CapabilityMatrix = {
  skills: {
    support: 'native',
    explanation:
      'Skills compile to `.claude/skills/<id>/SKILL.md` in the Agent Skills format and double as slash commands.',
  },
  agents: {
    support: 'native',
    explanation:
      'Every non-primary agent becomes a subagent in `.claude/agents/<id>.md` with its own tools, model and permission mode.',
  },
  parallelAgents: {
    support: 'native',
    explanation:
      'Claude Code can run subagents concurrently through the Agent tool, so parallel workflow branches keep their meaning.',
  },
  workflows: {
    support: 'adapted',
    explanation:
      'Claude Code has no workflow primitive. Each workflow compiles to an invocable orchestration skill that spells out the steps, delegation and gates.',
  },
  hooks: {
    support: 'native',
    explanation:
      'Hooks compile to `.claude/settings.json` entries on the matching lifecycle event, with command or prompt handlers.',
  },
  gates: {
    support: 'native',
    explanation:
      'Gate criteria that run a command become `Stop` hooks; criteria that cannot be automated stay as instructions in the workflow skill.',
  },
  permissions: {
    support: 'native',
    explanation:
      'Permissions compile to allow, ask and deny rules. Claude resolves deny before ask before allow, so a broad rule can override a narrow exception.',
  },
  memory: {
    support: 'native',
    explanation:
      'Memory definitions seed the `CLAUDE.md` memory section and enable Claude Code auto-memory.',
  },
  pathScopedRules: {
    support: 'native',
    explanation:
      'Rules with path globs compile to `.claude/rules/<id>.md` with a `paths:` header, so they load only when a matching file is read.',
  },
  commands: {
    support: 'native',
    explanation: 'Skills and workflows are invocable as slash commands (`/<id>`).',
  },
  ironLaws: {
    support: 'adapted',
    explanation:
      'Iron Laws become a prominent `CLAUDE.md` section; laws whose enforcement includes a hook also get a `Stop` prompt check.',
  },
  references: {
    support: 'native',
    explanation:
      'References attached to a skill are copied beside it; the others live in `.claude/references/` and are imported from `CLAUDE.md`.',
  },
}

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
function toolNames(toolIds: readonly string[], blueprint: Blueprint): string[] {
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
const TOOLS_BEHIND_OPERATION: Record<Exclude<PermissionOperation, 'mcp'>, string[]> = {
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
function lowerSubagentDenials(
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

function permissionModeFor(agent: Agent, options: ClaudeCodeOptions): string | undefined {
  if (options.permissionMode) return options.permissionMode
  const decisions = Object.values(agent.permissions.operations)
  if (decisions.length === 0) return undefined
  if (decisions.every((decision) => decision === 'allow')) return 'acceptEdits'
  return 'default'
}

function ruleFile(rule: Rule): GeneratedFile {
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

function agentFile(agent: Agent, blueprint: Blueprint, options: ClaudeCodeOptions): GeneratedFile {
  const laws = lawsForAgent(blueprint, agent.id).filter((law) => !law.scope.all)
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
    `${AGENTS_DIR}/${agent.id}.md`,
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

function skillFrontmatter(skill: Skill): Frontmatter {
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

export const claudeCodeAdapter: HarnessAdapter<ClaudeCodeOptions> = {
  id: 'claude-code',
  name: 'Claude Code',
  version: '1.0.0',
  docsUrl: 'https://code.claude.com/docs/en/skills',
  capabilities,
  optionsSchema,
  parseOptions: (raw) => optionsSchema.parse(raw),

  validate(blueprint) {
    const diagnostics: Diagnostic[] = []
    // Workflows and skills share `.claude/skills/<id>`, so their ids must not collide.
    for (const workflow of blueprint.workflows) {
      if (blueprint.skills.some((skill) => skill.id === workflow.id)) {
        diagnostics.push({
          code: 'BP-CLAUDE-001',
          severity: 'error',
          message: `Workflow "${workflow.id}" and a skill share an id. Claude Code stores both as .claude/skills/${workflow.id}, so one would overwrite the other.`,
          ref: { kind: 'workflow', id: workflow.id },
          related: [{ kind: 'skill', id: workflow.id }],
        })
      }
    }
    return diagnostics
  },

  compile(blueprint, options): CompileResult {
    const files: GeneratedFile[] = []
    const issues: CompatibilityIssue[] = []
    const primary = primaryAgentOf(blueprint)

    const looseReferences = blueprint.references.filter(
      (reference) => !blueprint.skills.some((skill) => skill.referenceIds.includes(reference.id)),
    )

    const instructions = composeInstructions(blueprint, {
      phrasing: CLAUDE_PHRASING,
      sourcePath: 'blueprint/',
      nativePathScopedRules: true,
      pathScopedRuleLocation: (ruleId) => `${RULES_DIR}/${ruleId}.md`,
      memoryNative: true,
      referenceLink: (referenceId) => `@${REFERENCES_DIR}/${referenceId}.md`,
    })
    files.push(
      generatedFile('CLAUDE.md', instructions.content, 'markdown', 'claude-code', [
        ...(primary ? [{ kind: 'agent' as const, id: primary.id }] : []),
      ]),
    )

    for (const rule of blueprint.rules) {
      if (rule.paths.length > 0) files.push(ruleFile(rule))
    }

    for (const skill of blueprint.skills) {
      const result = emitSkillDir(skill, blueprint, {
        root: SKILLS_DIR,
        owner: 'claude-code',
        extraFrontmatter: skillFrontmatter(skill),
        allowedTools: toolNames(skill.allowedToolIds, blueprint),
      })
      files.push(...result.files)
      for (const warning of result.warnings) {
        issues.push({
          harnessId: 'claude-code',
          concept: 'skills',
          support: 'limited',
          ref: { kind: 'skill', id: skill.id },
          message: warning,
        })
      }
    }

    for (const workflow of blueprint.workflows) {
      const { body, notes } = emitWorkflowSkill(workflow, blueprint, CLAUDE_PHRASING)
      const frontmatter: Frontmatter = {
        name: workflow.id,
        description: workflow.description ?? workflow.name,
        'user-invocable': true,
        ...(workflow.argumentHint ? { 'argument-hint': workflow.argumentHint } : {}),
      }
      files.push(
        generatedFile(
          `${SKILLS_DIR}/${workflow.id}/SKILL.md`,
          markdownWithFrontmatter(frontmatter, body, `blueprint/workflows/${workflow.id}.md`),
          'markdown',
          'claude-code',
          [{ kind: 'workflow', id: workflow.id }],
        ),
      )
      issues.push({
        harnessId: 'claude-code',
        concept: 'workflows',
        support: 'adapted',
        ref: { kind: 'workflow', id: workflow.id },
        message: `Workflow "${workflow.name}" is compiled to an orchestration skill; Claude Code has no workflow engine, so the steps are instructions rather than enforced control flow.`,
        adaptation: `${SKILLS_DIR}/${workflow.id}/SKILL.md`,
      })
      for (const note of notes) {
        issues.push({
          harnessId: 'claude-code',
          concept: 'workflows',
          support: 'limited',
          ref: { kind: 'workflow', id: workflow.id },
          message: note.message,
        })
      }
    }

    for (const agent of blueprint.agents) {
      if (agent.id === primary?.id) continue
      files.push(agentFile(agent, blueprint, options))
    }

    for (const reference of looseReferences) {
      files.push(
        generatedFile(
          `${REFERENCES_DIR}/${reference.id}.md`,
          renderReference(reference),
          'markdown',
          'claude-code',
          [{ kind: 'reference', id: reference.id }],
        ),
      )
    }

    if (options.emitSettings) {
      const { settings, issues: settingsIssues } = buildSettings(
        blueprint,
        primary,
        lawsForAgent(blueprint, primary?.id),
      )
      issues.push(...settingsIssues)
      if (Object.keys(settings).length > 0) {
        files.push(
          generatedFile('.claude/settings.json', stableJson(settings), 'json', 'claude-code', []),
        )
      }
      files.push(...hookScriptFiles(blueprint))
    }

    const mcpTools = blueprint.tools.filter((tool) => tool.mcp)
    if (mcpTools.length > 0) {
      const servers = Object.fromEntries(
        mcpTools.map((tool) => [
          tool.id,
          {
            ...(tool.mcp?.command ? { command: tool.mcp.command } : {}),
            ...(tool.mcp?.args.length ? { args: tool.mcp.args } : {}),
            ...(tool.mcp?.url ? { url: tool.mcp.url } : {}),
            // Only variable names are emitted; values never leave the user's machine.
            ...(tool.mcp?.envVars.length
              ? { env: Object.fromEntries(tool.mcp.envVars.map((name) => [name, ''])) }
              : {}),
          },
        ]),
      )
      files.push(
        generatedFile(
          '.mcp.json',
          stableJson({ mcpServers: servers }),
          'json',
          'claude-code',
          mcpTools.map((tool) => ({ kind: 'tool' as const, id: tool.id })),
        ),
      )
    }

    return { files, issues }
  },
}
