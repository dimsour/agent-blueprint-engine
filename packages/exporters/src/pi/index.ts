/**
 * Pi adapter.
 *
 * Pi runs one agent by design, so this is the adapter where the Blueprint's shape and the
 * harness's disagree most, and most of the work is saying so honestly. What Pi does have is
 * good: the Agent Skills tree, prompt templates, a system-prompt append and a built-in tool
 * allowlist. What it does not have is subagents, an `ask` decision, a network tool, and any
 * enforcement that is not TypeScript.
 *
 * File conventions and field names: docs/harness/pi.md.
 */
import type { Agent, Blueprint, Diagnostic, IronLaw, Workflow } from '@agent-blueprint/core'
import { stableJson } from '@agent-blueprint/core'
import { z } from 'zod'

import { type Frontmatter, markdownWithFrontmatter } from '../shared/frontmatter'
import { withHeader } from '../shared/header'
import { lawsForAgent, primaryAgentOf } from '../shared/instructions'
import { SINGLE_AGENT_PHRASING } from '../shared/phrasing'
import {
  directoryScopedRules,
  emitPortableInstructionFile,
  emitPortableSkillSet,
  PORTABLE_REFERENCES_DIR,
  PORTABLE_SKILLS_DIR,
} from '../shared/portable'
import {
  type CapabilityMatrix,
  type CompatibilityIssue,
  type CompileResult,
  generatedFile,
  type GeneratedFile,
  type HarnessAdapter,
} from '../types'

const PROMPTS_DIR = '.pi/prompts'
const SETTINGS_FILE = '.pi/settings.json'
const APPEND_SYSTEM_FILE = '.pi/APPEND_SYSTEM.md'

/** The built-in tools Pi can be told to start with, in the order its documentation lists them. */
const TOOLS = ['read', 'bash', 'powershell', 'edit', 'write', 'grep', 'find', 'ls'] as const
type PiTool = (typeof TOOLS)[number]

const optionsSchema = z
  .object({
    /** Set false when the repository already has a hand-written `.pi/settings.json`. */
    emitSettings: z.boolean().default(true),
  })
  .prefault({})

export type PiOptions = z.output<typeof optionsSchema>

const capabilities: CapabilityMatrix = {
  skills: {
    support: 'native',
    explanation:
      'Skills compile to `.agents/skills/<id>/SKILL.md`, one of the directories Pi reads, and are invocable with `/skill:<id>`.',
  },
  agents: {
    support: 'unsupported',
    explanation:
      'Pi runs a single agent by design. Other agents become prompt templates that ask the one session to adopt their persona, which loses the isolation the Blueprint asks for.',
  },
  parallelAgents: {
    support: 'unsupported',
    explanation:
      'Without subagents there is no parallelism; parallel branches are performed one after another.',
  },
  workflows: {
    support: 'adapted',
    explanation:
      'Each workflow becomes an orchestration skill plus a `/`-invocable prompt template in `.pi/prompts/` that runs it. The steps are instructions, not enforced control flow.',
  },
  hooks: {
    support: 'adapted',
    explanation:
      'Pi hooks are TypeScript extensions rather than configuration. Generating one is roadmap P8-11; today hooks are described in AGENTS.md and run by hand.',
  },
  gates: {
    support: 'adapted',
    explanation:
      'Gates become instructions in the workflow skill and prompt; enforcing them needs the same extension the hooks need.',
  },
  permissions: {
    support: 'limited',
    explanation:
      'The `defaultTools` allowlist is enforced, but Pi has no `ask` decision, no per-command rules and no network tool, so those parts of a permission set become a written policy.',
  },
  memory: {
    support: 'unsupported',
    explanation:
      'Pi has context files but no persistent memory; memory definitions become instructions to keep notes in the repository.',
  },
  pathScopedRules: {
    support: 'adapted',
    explanation:
      'Rules limited to a plain directory become a nested `AGENTS.md` that Pi loads when it works there; glob-scoped rules are inlined with an "Applies to" line.',
  },
  commands: {
    support: 'native',
    explanation: 'Workflows and non-primary personas are `/`-invocable prompts in `.pi/prompts/`.',
  },
  ironLaws: {
    support: 'adapted',
    explanation:
      'Iron Laws become a section in AGENTS.md; the critical ones are also appended to the system prompt through `.pi/APPEND_SYSTEM.md`, which is the closest Pi comes to enforcing one.',
  },
  references: {
    support: 'native',
    explanation:
      'References attached to a skill are copied beside it; the others live in `.agents/references/`.',
  },
}

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'pi', concept, support, message, ...extra })

/**
 * The built-in tools the primary agent's permissions leave open. Pi has no `ask`, so anything
 * not denied is enabled and the approval the author asked for is reported as lost.
 */
export function defaultTools(agent: Agent): PiTool[] {
  const operations = agent.permissions.operations
  const open = (...names: (keyof typeof operations)[]): boolean =>
    names.some((name) => operations[name] !== undefined && operations[name] !== 'deny')

  const tools = new Set<PiTool>()
  if (open('fs.read')) for (const tool of ['read', 'grep', 'find', 'ls'] as const) tools.add(tool)
  if (open('fs.write')) for (const tool of ['edit', 'write'] as const) tools.add(tool)
  if (open('shell.readonly', 'shell.mutating', 'git.read', 'git.commit', 'git.push', 'fs.delete')) {
    // The same capability on two platforms; denying one and leaving the other is not a boundary.
    tools.add('bash')
    tools.add('powershell')
  }
  return TOOLS.filter((tool) => tools.has(tool))
}

/** Iron Laws that belong in the system prompt: the ones whose violation ends the task. */
function criticalLaws(blueprint: Blueprint, primary: Agent | undefined): IronLaw[] {
  return lawsForAgent(blueprint, primary?.id).filter((law) => law.severity === 'critical')
}

function appendSystemFile(laws: IronLaw[]): GeneratedFile {
  const body = [
    '# Iron Laws',
    'These hold for every task in this repository, without exception.',
    ...laws.map((law) =>
      [`- **${law.name}.** ${law.rule}`, law.violationBehavior ? `  ${law.violationBehavior}` : '']
        .filter(Boolean)
        .join('\n'),
    ),
  ].join('\n\n')
  return generatedFile(
    APPEND_SYSTEM_FILE,
    `${withHeader('blueprint/laws/', body)}\n`,
    'markdown',
    'pi',
    laws.map((law) => ({ kind: 'iron-law' as const, id: law.id })),
  )
}

function workflowPrompt(workflow: Workflow): GeneratedFile {
  const frontmatter: Frontmatter = { description: workflow.description ?? workflow.name }
  const body = [
    `# ${workflow.name}`,
    workflow.description,
    `Run the ${workflow.name} workflow. Read \`${PORTABLE_SKILLS_DIR}/${workflow.id}/SKILL.md\` and follow it exactly: it gives the steps in order, who performs each one, and what has to hold before the next begins. Do not skip a step, a verification or a gate.`,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n')
  return generatedFile(
    `${PROMPTS_DIR}/${workflow.id}.md`,
    markdownWithFrontmatter(frontmatter, body, `blueprint/workflows/${workflow.id}.md`),
    'markdown',
    'pi',
    [{ kind: 'workflow', id: workflow.id }],
  )
}

/**
 * A non-primary agent has nowhere to run on Pi, so it becomes a prompt that puts the one
 * session into that persona for a task. It is not the isolation the Blueprint asked for, and
 * the compatibility issue beside it says so.
 */
function personaPrompt(agent: Agent, blueprint: Blueprint): GeneratedFile {
  const laws = lawsForAgent(blueprint, agent.id).filter((law) => !law.scope.all)
  const sections = [
    `${SINGLE_AGENT_PHRASING.delegate(agent.id)}: you are ${agent.name}.`,
    agent.body,
  ]
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
  sections.push('## The task\n\n$ARGUMENTS')

  const frontmatter: Frontmatter = {
    description: `Work as ${agent.name}. ${agent.description ?? agent.responsibilities.join('; ')}`,
    'argument-hint': '<task>',
  }
  return generatedFile(
    `${PROMPTS_DIR}/${agent.id}.md`,
    markdownWithFrontmatter(
      frontmatter,
      sections.filter((section) => section.trim().length > 0).join('\n\n'),
      `blueprint/agents/${agent.id}.md`,
    ),
    'markdown',
    'pi',
    [{ kind: 'agent', id: agent.id }],
  )
}

export const piAdapter: HarnessAdapter<PiOptions> = {
  id: 'pi',
  name: 'Pi',
  version: '1.0.0',
  docsUrl: 'https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md',
  capabilities,
  optionsSchema,
  parseOptions: (raw) => optionsSchema.parse(raw),

  validate(blueprint) {
    const diagnostics: Diagnostic[] = []
    for (const workflow of blueprint.workflows) {
      if (blueprint.skills.some((skill) => skill.id === workflow.id)) {
        diagnostics.push({
          code: 'BP-PI-001',
          severity: 'error',
          message: `Workflow "${workflow.id}" and a skill share an id. Both compile to ${PORTABLE_SKILLS_DIR}/${workflow.id}, so one would overwrite the other.`,
          ref: { kind: 'workflow', id: workflow.id },
          related: [{ kind: 'skill', id: workflow.id }],
        })
      }
    }

    // Workflows and personas are both prompt templates, so their ids share one directory.
    const primary = primaryAgentOf(blueprint)
    for (const agent of blueprint.agents) {
      if (agent.id === primary?.id) continue
      if (blueprint.workflows.some((workflow) => workflow.id === agent.id)) {
        diagnostics.push({
          code: 'BP-PI-002',
          severity: 'error',
          message: `Agent "${agent.id}" and a workflow share an id. Pi has no subagents, so both compile to ${PROMPTS_DIR}/${agent.id}.md and one would overwrite the other.`,
          ref: { kind: 'agent', id: agent.id },
          related: [{ kind: 'workflow', id: agent.id }],
        })
      }
    }
    return diagnostics
  },

  compile(blueprint, options): CompileResult {
    const files: GeneratedFile[] = []
    const issues: CompatibilityIssue[] = []
    const primary = primaryAgentOf(blueprint)
    const others = blueprint.agents.filter((agent) => agent.id !== primary?.id)

    files.push(emitPortableInstructionFile(blueprint).file)

    const skillSet = emitPortableSkillSet(blueprint, {
      root: PORTABLE_SKILLS_DIR,
      owner: 'shared',
      referencesDir: PORTABLE_REFERENCES_DIR,
    })
    files.push(...skillSet.files)
    for (const warning of skillSet.warnings) {
      issues.push(
        issue('skills', 'limited', warning.message, {
          ref: { kind: 'skill', id: warning.skillId },
        }),
      )
    }

    for (const workflow of blueprint.workflows) {
      files.push(workflowPrompt(workflow))
      issues.push(
        issue(
          'workflows',
          'adapted',
          `Workflow "${workflow.name}" is compiled to an orchestration skill invoked with /${workflow.id}; Pi has no workflow engine, so the steps are instructions rather than enforced control flow.`,
          {
            ref: { kind: 'workflow', id: workflow.id },
            adaptation: `${PROMPTS_DIR}/${workflow.id}.md`,
          },
        ),
      )
    }

    for (const agent of others) {
      files.push(personaPrompt(agent, blueprint))
      issues.push(
        issue(
          'agents',
          'unsupported',
          `Pi has no subagents, so "${agent.name}" cannot run as a separate agent. It is a prompt that puts the one session into that persona, which loses the isolation the Blueprint asks for: the context is shared, and nothing stops the session carrying assumptions between personas.`,
          { ref: { kind: 'agent', id: agent.id }, adaptation: `${PROMPTS_DIR}/${agent.id}.md` },
        ),
      )
    }
    if (blueprint.workflows.some((workflow) => workflow.edges.some((e) => e.kind === 'parallel'))) {
      issues.push(
        issue(
          'parallelAgents',
          'unsupported',
          'Parallel workflow branches run one after another on Pi, which changes timing and cost but not the result.',
        ),
      )
    }

    // Rules limited to a plain directory become a nested AGENTS.md, byte-identical to the one
    // Codex and OpenCode emit, so the targets share the file instead of fighting over it.
    const scoped = directoryScopedRules(blueprint)
    for (const { dir, ruleIds } of scoped) {
      const rules = blueprint.rules.filter((rule) => ruleIds.includes(rule.id))
      const body = [
        `# Rules for ${dir}`,
        ...rules.map((rule) => `- **${rule.name}.** ${rule.guidance}`),
      ].join('\n\n')
      files.push(
        generatedFile(
          `${dir}/AGENTS.md`,
          `${withHeader('blueprint/rules/', body)}\n`,
          'markdown',
          'shared',
          rules.map((rule) => ({ kind: 'rule' as const, id: rule.id })),
        ),
      )
    }
    for (const rule of blueprint.rules) {
      if (rule.paths.length === 0) continue
      if (scoped.some((entry) => entry.ruleIds.includes(rule.id))) continue
      issues.push(
        issue(
          'pathScopedRules',
          'adapted',
          `Rule "${rule.name}" applies to ${rule.paths.join(', ')}, which is not a plain directory, so Pi cannot load it selectively; it is always in context with an "Applies to" note.`,
          { ref: { kind: 'rule', id: rule.id } },
        ),
      )
    }

    const critical = criticalLaws(blueprint, primary)
    if (critical.length > 0) files.push(appendSystemFile(critical))

    if (options.emitSettings && primary) {
      const tools = defaultTools(primary)
      files.push(
        generatedFile(SETTINGS_FILE, stableJson({ defaultTools: tools }), 'json', 'pi', []),
      )

      const asked = Object.entries(primary.permissions.operations)
        .filter(([, decision]) => decision === 'ask')
        .map(([operation]) => operation)
      if (asked.length > 0) {
        issues.push(
          issue(
            'permissions',
            'limited',
            `Pi has no "ask" decision. ${asked.join(', ')} are set to ask on "${primary.name}", so the tool stays enabled and the approval becomes a written instruction rather than a prompt.`,
            {
              ref: { kind: 'agent', id: primary.id },
              adaptation: 'AGENTS.md "Command policy" section',
            },
          ),
        )
      }
      if (primary.permissions.patterns.length > 0) {
        issues.push(
          issue(
            'permissions',
            'limited',
            `\`defaultTools\` names tools, not commands, so the ${primary.permissions.patterns.length} per-command rule(s) on "${primary.name}" cannot be enforced. They are written into AGENTS.md as a command policy the agent is told to follow.`,
            {
              ref: { kind: 'agent', id: primary.id },
              adaptation: 'AGENTS.md "Command policy" section',
            },
          ),
        )
      }
      const network = (['net.docs', 'net.any'] as const).filter(
        (operation) => primary.permissions.operations[operation] === 'allow',
      )
      if (network.length > 0) {
        issues.push(
          issue(
            'permissions',
            'limited',
            `Pi has no built-in network tool, so ${network.join(' and ')} cannot be granted. Fetching documentation needs an extension or a shell command, and the shell is governed by \`bash\` instead.`,
            { ref: { kind: 'agent', id: primary.id } },
          ),
        )
      }
    }

    if (blueprint.memories.length > 0) {
      issues.push(
        issue(
          'memory',
          'unsupported',
          `Pi has no persistent memory. The ${blueprint.memories.length} memory definition(s) are compiled into AGENTS.md as instructions to write notes into the repository instead.`,
          { adaptation: 'AGENTS.md "Memory" section' },
        ),
      )
    }

    if (blueprint.hooks.length > 0 || blueprint.gates.length > 0) {
      issues.push(
        issue(
          'hooks',
          'adapted',
          `${blueprint.hooks.length} hook(s) and ${blueprint.gates.length} gate(s) need a TypeScript extension on Pi, which is code rather than configuration. They are described in AGENTS.md and in the workflow skills, and nothing runs them automatically (roadmap P8-11).`,
        ),
      )
    }

    return { files, issues }
  },
}
