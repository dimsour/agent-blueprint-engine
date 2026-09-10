/**
 * GitHub Copilot adapter.
 *
 * Copilot reads the portable `AGENTS.md`, so this adapter shares that file with Codex,
 * OpenCode and Pi and then adds what is Copilot's own: custom agents, path-scoped
 * instructions, prompt files, hooks and the editor's MCP configuration. Everything lives
 * under `.github/` so a repository stays readable to the harnesses that ignore it.
 *
 * File conventions and field names: docs/harness/copilot.md.
 */
import type { Agent, Blueprint, Diagnostic, Rule, Workflow } from '@agent-blueprint/core'
import { stableJson } from '@agent-blueprint/core'
import { z } from 'zod'

import { withHeader } from '../shared/header'
import { type Frontmatter, markdownWithFrontmatter } from '../shared/frontmatter'
import { lawsForAgent, primaryAgentOf } from '../shared/instructions'
import { emitPortableInstructionFile, emitPortableSkillSet } from '../shared/portable'
import {
  type CapabilityMatrix,
  type CompatibilityIssue,
  type CompileResult,
  generatedFile,
  type GeneratedFile,
  type HarnessAdapter,
} from '../types'
import { buildHooks, mcpServers, toolAliases, unnamedMcpTools } from './settings'

const SKILLS_DIR = '.github/skills'
const AGENTS_DIR = '.github/agents'
const PROMPTS_DIR = '.github/prompts'
const INSTRUCTIONS_DIR = '.github/instructions'
const REFERENCES_DIR = '.github/references'
const HOOKS_FILE = '.github/hooks/blueprint.json'

/** Copilot caps a custom agent body. */
const AGENT_BODY_MAX_CHARS = 30_000

const optionsSchema = z
  .object({
    /** Set false when the repository already has hand-written `.github/hooks/`. */
    emitHooks: z.boolean().default(true),
  })
  .prefault({})

export type CopilotOptions = z.output<typeof optionsSchema>

const capabilities: CapabilityMatrix = {
  skills: {
    support: 'native',
    explanation:
      'Skills compile to `.github/skills/<id>/SKILL.md`; Copilot also reads `.claude/skills` and `.agents/skills`.',
  },
  agents: {
    support: 'native',
    explanation:
      'Every non-primary agent becomes a custom agent in `.github/agents/<id>.agent.md` with its own tool allowlist and subagent list.',
  },
  parallelAgents: {
    support: 'limited',
    explanation:
      'Subagents exist but Copilot documents no concurrency control, so parallel branches may run one after another.',
  },
  workflows: {
    support: 'adapted',
    explanation:
      'Copilot has no workflow engine. Each workflow becomes an orchestration skill plus a `/`-invocable prompt file that runs it, so the steps are instructions rather than enforced control flow.',
  },
  hooks: {
    support: 'native',
    explanation:
      'Hooks compile to `.github/hooks/blueprint.json` on the matching lifecycle event, with a bash and a PowerShell command for each handler.',
  },
  gates: {
    support: 'adapted',
    explanation:
      'Gate criteria that run a command become `agentStop` handlers that refuse the stop when the command fails; criteria that cannot be automated stay instructions.',
  },
  permissions: {
    support: 'limited',
    explanation:
      'A custom agent carries an allowlist of tool categories, which is enforced, but Copilot has no per-command rule syntax, so patterns such as "dotnet test is fine, git push is not" stay a written policy.',
  },
  memory: {
    support: 'unsupported',
    explanation:
      'Copilot has no persistent memory; memory definitions become instructions to keep notes in the repository.',
  },
  pathScopedRules: {
    support: 'native',
    explanation:
      'Rules with path globs compile to `.github/instructions/<id>.instructions.md` with an `applyTo` glob, so they load only for matching files.',
  },
  commands: {
    support: 'native',
    explanation: 'Workflows are `/`-invocable prompt files in `.github/prompts/`.',
  },
  ironLaws: {
    support: 'adapted',
    explanation:
      'Iron Laws become a section in AGENTS.md; laws marked for hook enforcement also print a reminder when the agent stops.',
  },
  references: {
    support: 'native',
    explanation:
      'References attached to a skill are copied beside it; the others live in `.github/references/`.',
  },
}

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'copilot', concept, support, message, ...extra })

function describe(agent: Agent): string {
  return agent.description ?? agent.responsibilities.join('; ')
}

/** The persona, plus the parts of the Blueprint that only apply to this agent. */
function agentBody(agent: Agent, blueprint: Blueprint): string {
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
  return sections.filter((section) => section.trim().length > 0).join('\n\n')
}

/** Delegation targets that have an agent file of their own to hand off to. */
function delegatesOf(agent: Agent, blueprint: Blueprint, primaryId: string | undefined): string[] {
  return (agent.delegation?.canDelegateTo ?? []).filter(
    (id) => id !== primaryId && blueprint.agents.some((candidate) => candidate.id === id),
  )
}

function agentFile(agent: Agent, blueprint: Blueprint, primaryId: string | undefined) {
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
    `${AGENTS_DIR}/${agent.id}.agent.md`,
    markdownWithFrontmatter(
      frontmatter,
      agentBody(agent, blueprint),
      `blueprint/agents/${agent.id}.md`,
    ),
    'markdown',
    'copilot',
    [{ kind: 'agent', id: agent.id }],
  )
}

function instructionFile(rule: Rule): GeneratedFile {
  const frontmatter: Frontmatter = {
    name: rule.name,
    description: rule.description ?? rule.guidance,
    // Several globs are one comma-separated value, not a list.
    applyTo: rule.paths.join(', '),
  }
  const body = [`# ${rule.name}`, rule.guidance, rule.body].filter(Boolean).join('\n\n')
  return generatedFile(
    `${INSTRUCTIONS_DIR}/${rule.id}.instructions.md`,
    markdownWithFrontmatter(frontmatter, body, `blueprint/rules/${rule.id}.md`),
    'markdown',
    'copilot',
    [{ kind: 'rule', id: rule.id }],
  )
}

/**
 * The prompt file makes a workflow invocable as `/<id>`. It points at the orchestration
 * skill instead of repeating it: the same choice `.github/copilot-instructions.md` makes
 * about `AGENTS.md`, and for the same reason — two copies of a procedure in one repository
 * is one copy too many, and the skill is the copy every Copilot client can read.
 */
function promptFile(workflow: Workflow): GeneratedFile {
  const frontmatter: Frontmatter = {
    name: workflow.id,
    description: workflow.description ?? workflow.name,
    agent: 'agent',
  }
  const body = [
    `# ${workflow.name}`,
    workflow.description,
    `Run the ${workflow.name} workflow. Read \`${SKILLS_DIR}/${workflow.id}/SKILL.md\` and follow it exactly: it gives the steps in order, who performs each one, and what has to hold before the next begins. Do not skip a step, a verification or a gate.`,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n')
  return generatedFile(
    `${PROMPTS_DIR}/${workflow.id}.prompt.md`,
    markdownWithFrontmatter(frontmatter, body, `blueprint/workflows/${workflow.id}.md`),
    'markdown',
    'copilot',
    [{ kind: 'workflow', id: workflow.id }],
  )
}

/** Copilot's documented entry point, pointing at the content rather than duplicating it. */
function instructionsPointer(blueprint: Blueprint): GeneratedFile {
  const body = [
    `# ${blueprint.name}`,
    blueprint.description ?? '',
    'The full agent definition is in `AGENTS.md` at the repository root. Read it before making changes, and follow its Iron Laws without exception.',
    'Skills for specific tasks are in `.github/skills/`, workflows are `/`-invocable prompts in `.github/prompts/`, and rules that apply to particular files are in `.github/instructions/`.',
  ]
    .filter((part) => part.length > 0)
    .join('\n\n')
  return generatedFile(
    '.github/copilot-instructions.md',
    `${withHeader('blueprint/', body)}\n`,
    'markdown',
    'copilot',
    [],
  )
}

export const copilotAdapter: HarnessAdapter<CopilotOptions> = {
  id: 'copilot',
  name: 'GitHub Copilot',
  version: '1.0.0',
  docsUrl: 'https://docs.github.com/en/copilot/reference/custom-agents-configuration',
  capabilities,
  optionsSchema,
  parseOptions: (raw) => optionsSchema.parse(raw),

  validate(blueprint) {
    const diagnostics: Diagnostic[] = []
    for (const workflow of blueprint.workflows) {
      if (blueprint.skills.some((skill) => skill.id === workflow.id)) {
        diagnostics.push({
          code: 'BP-COPILOT-001',
          severity: 'error',
          message: `Workflow "${workflow.id}" and a skill share an id. Both compile to ${SKILLS_DIR}/${workflow.id}, so one would overwrite the other.`,
          ref: { kind: 'workflow', id: workflow.id },
          related: [{ kind: 'skill', id: workflow.id }],
        })
      }
    }

    const primary = primaryAgentOf(blueprint)
    for (const agent of blueprint.agents) {
      if (agent.id === primary?.id) continue
      const size = agentBody(agent, blueprint).length
      if (size > AGENT_BODY_MAX_CHARS) {
        diagnostics.push({
          code: 'BP-COPILOT-002',
          severity: 'warning',
          message: `The custom agent file for "${agent.name}" is ${size} characters, above Copilot's ${AGENT_BODY_MAX_CHARS}-character limit. Shorten the persona, or move detail into a skill the agent can read.`,
          ref: { kind: 'agent', id: agent.id },
        })
      }
    }
    return diagnostics
  },

  compile(blueprint, options): CompileResult {
    const files: GeneratedFile[] = []
    const issues: CompatibilityIssue[] = []
    const primary = primaryAgentOf(blueprint)
    const subagents = blueprint.agents.filter((agent) => agent.id !== primary?.id)

    files.push(emitPortableInstructionFile(blueprint).file)
    files.push(instructionsPointer(blueprint))

    const skillSet = emitPortableSkillSet(blueprint, {
      root: SKILLS_DIR,
      owner: 'copilot',
      referencesDir: REFERENCES_DIR,
    })
    files.push(...skillSet.files)
    for (const warning of skillSet.warnings) {
      issues.push(
        issue('skills', 'limited', warning.message, {
          ref: { kind: 'skill', id: warning.skillId },
        }),
      )
    }

    for (const agent of subagents) files.push(agentFile(agent, blueprint, primary?.id))

    for (const workflow of blueprint.workflows) {
      files.push(promptFile(workflow))
      issues.push(
        issue(
          'workflows',
          'adapted',
          `Workflow "${workflow.name}" is compiled to an orchestration skill invoked with /${workflow.id}; Copilot has no workflow engine, so the steps are instructions rather than enforced control flow.`,
          {
            ref: { kind: 'workflow', id: workflow.id },
            adaptation: `${PROMPTS_DIR}/${workflow.id}.prompt.md`,
          },
        ),
      )
    }

    for (const rule of blueprint.rules) {
      if (rule.paths.length > 0) files.push(instructionFile(rule))
    }

    const laws = lawsForAgent(blueprint, primary?.id)
    if (options.emitHooks) {
      const hooks = buildHooks(blueprint, laws)
      issues.push(...hooks.issues)
      if (hooks.file) {
        files.push(generatedFile(HOOKS_FILE, stableJson(hooks.file), 'json', 'copilot', []))
      }
    }

    const servers = mcpServers(blueprint)
    if (Object.keys(servers).length > 0) {
      files.push(
        generatedFile(
          '.vscode/mcp.json',
          stableJson({ servers }),
          'json',
          'copilot',
          blueprint.tools.filter((tool) => tool.mcp).map((tool) => ({ kind: 'tool', id: tool.id })),
        ),
      )
      issues.push(
        issue(
          'permissions',
          'limited',
          'MCP servers are configured for the editor in `.vscode/mcp.json`. The cloud coding agent takes its MCP configuration from repository settings instead, so it has to be set up there by hand.',
        ),
      )
    }
    const unnamed = unnamedMcpTools(blueprint)
    for (const tool of unnamed) {
      issues.push(
        issue(
          'permissions',
          'limited',
          `A Copilot tool allowlist names MCP tools as \`server/tool\`, and "${tool.name}" does not list the operations it offers, so it cannot be allowed by name. Add its operations to the tool, or widen the allowlist by hand.`,
          { ref: { kind: 'tool', id: tool.id } },
        ),
      )
    }

    if (blueprint.memories.length > 0) {
      issues.push(
        issue(
          'memory',
          'unsupported',
          `Copilot has no persistent memory. The ${blueprint.memories.length} memory definition(s) are compiled into AGENTS.md as instructions to write notes into the repository instead.`,
          { adaptation: 'AGENTS.md "Memory" section' },
        ),
      )
    }

    const withPatterns = blueprint.agents.filter((agent) => agent.permissions.patterns.length > 0)
    for (const agent of withPatterns) {
      issues.push(
        issue(
          'permissions',
          'limited',
          `A Copilot allowlist names tool categories, not commands, so the ${agent.permissions.patterns.length} per-command rule(s) on "${agent.name}" cannot be enforced. They are written into AGENTS.md as a command policy the agent is told to follow.`,
          {
            ref: { kind: 'agent', id: agent.id },
            adaptation: 'AGENTS.md "Command policy" section',
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
          `The primary agent is AGENTS.md rather than a custom agent file, so "${primary.name}" cannot declare its handoffs in frontmatter. The agents it delegates to are named in the AGENTS.md roster and in each workflow.`,
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

    return { files, issues }
  },
}
