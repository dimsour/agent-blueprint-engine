/**
 * OpenCode adapter.
 *
 * OpenCode reads the portable `AGENTS.md` and `.agents/skills/` tree that Codex and Pi read,
 * so this adapter shares those and adds what is OpenCode's own: `opencode.json`, subagent
 * files and commands. It is the target that loses the least, because its permission model is
 * the only one as expressive as the Blueprint's.
 *
 * File conventions and field names: docs/harness/opencode.md.
 */
import type { Agent, Blueprint, Diagnostic, Workflow } from '@agent-blueprint/core'
import { stableJson } from '@agent-blueprint/core'
import { z } from 'zod'

import { type Frontmatter, markdownWithFrontmatter } from '../shared/frontmatter'
import { withHeader } from '../shared/header'
import { lawsForAgent, primaryAgentOf } from '../shared/instructions'
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
import { buildConfig, lowerPermissions } from './config'

const AGENTS_DIR = '.opencode/agents'
const COMMANDS_DIR = '.opencode/commands'

const optionsSchema = z
  .object({
    /** Set false when the repository already has a hand-written `opencode.json`. */
    emitConfig: z.boolean().default(true),
  })
  .prefault({})

export type OpenCodeOptions = z.output<typeof optionsSchema>

const capabilities: CapabilityMatrix = {
  skills: {
    support: 'native',
    explanation:
      'Skills compile to `.agents/skills/<id>/SKILL.md`, one of the locations OpenCode loads through its `skill` tool.',
  },
  agents: {
    support: 'native',
    explanation:
      'Every non-primary agent becomes a `mode: subagent` file in `.opencode/agents/<id>.md` with its own permission block.',
  },
  parallelAgents: {
    support: 'limited',
    explanation:
      'The Task tool spawns subagents and `subagent_depth` bounds them, but OpenCode documents no explicit parallel control, so parallel branches may run one after another.',
  },
  workflows: {
    support: 'adapted',
    explanation:
      'OpenCode has no workflow engine. Each workflow becomes an orchestration skill plus a `/`-invocable command in `.opencode/commands/` that runs it.',
  },
  hooks: {
    support: 'adapted',
    explanation:
      'OpenCode hooks are TypeScript plugins rather than declarative config. Generating one is roadmap P8-10; today hooks are described in AGENTS.md and run by hand.',
  },
  gates: {
    support: 'adapted',
    explanation:
      'Gates become instructions in the workflow skill and command; enforcing them needs the same plugin the hooks need.',
  },
  permissions: {
    support: 'native',
    explanation:
      'Permissions compile to an `allow`/`ask`/`deny` block with command and path patterns, globally and per subagent. OpenCode reads patterns last-match-wins, so the broad rule is written first.',
  },
  memory: {
    support: 'unsupported',
    explanation:
      'OpenCode has no persistent memory; memory definitions become instructions to keep notes in the repository.',
  },
  pathScopedRules: {
    support: 'adapted',
    explanation:
      'Rules limited to a plain directory become a nested `AGENTS.md` that loads when work happens there; glob-scoped rules are inlined with an "Applies to" line.',
  },
  commands: {
    support: 'native',
    explanation: 'Workflows are `/`-invocable commands in `.opencode/commands/`.',
  },
  ironLaws: {
    support: 'adapted',
    explanation:
      'Iron Laws become a section in AGENTS.md; nothing enforces them until the hook plugin exists.',
  },
  references: {
    support: 'native',
    explanation:
      'References attached to a skill are copied beside it; the others live in `.agents/references/` and are named in the `instructions` list, so they are always loaded.',
  },
}

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'opencode', concept, support, message, ...extra })

/** OpenCode names a model `provider/id`; a hint without a provider would not resolve. */
function modelOf(agent: Agent): string | undefined {
  const hint = agent.model?.hint
  return hint?.includes('/') ? hint : undefined
}

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

function agentFile(
  agent: Agent,
  blueprint: Blueprint,
): { file: GeneratedFile; issues: CompatibilityIssue[] } {
  const lowered = lowerPermissions(agent)
  const frontmatter: Frontmatter = {
    description: agent.description ?? agent.responsibilities.join('; '),
    mode: 'subagent',
    ...(modelOf(agent) ? { model: modelOf(agent) } : {}),
    ...(Object.keys(lowered.permissions).length > 0 ? { permission: lowered.permissions } : {}),
  }
  return {
    file: generatedFile(
      `${AGENTS_DIR}/${agent.id}.md`,
      markdownWithFrontmatter(
        frontmatter,
        agentBody(agent, blueprint),
        `blueprint/agents/${agent.id}.md`,
      ),
      'markdown',
      'opencode',
      [{ kind: 'agent', id: agent.id }],
    ),
    issues: lowered.issues,
  }
}

/**
 * A command body is the prompt OpenCode sends, so it points at the orchestration skill rather
 * than repeating it: one procedure, one copy, and the skill is what the `skill` tool loads.
 */
function commandFile(workflow: Workflow): GeneratedFile {
  const frontmatter: Frontmatter = {
    description: workflow.description ?? workflow.name,
  }
  const body = [
    `# ${workflow.name}`,
    workflow.description,
    `Run the ${workflow.name} workflow. Read \`${PORTABLE_SKILLS_DIR}/${workflow.id}/SKILL.md\` and follow it exactly: it gives the steps in order, who performs each one, and what has to hold before the next begins. Do not skip a step, a verification or a gate.`,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n')
  return generatedFile(
    `${COMMANDS_DIR}/${workflow.id}.md`,
    markdownWithFrontmatter(frontmatter, body, `blueprint/workflows/${workflow.id}.md`),
    'markdown',
    'opencode',
    [{ kind: 'workflow', id: workflow.id }],
  )
}

export const openCodeAdapter: HarnessAdapter<OpenCodeOptions> = {
  id: 'opencode',
  name: 'OpenCode',
  version: '1.0.0',
  docsUrl: 'https://opencode.ai/docs/config/',
  capabilities,
  optionsSchema,
  parseOptions: (raw) => optionsSchema.parse(raw),

  validate(blueprint) {
    const diagnostics: Diagnostic[] = []
    for (const workflow of blueprint.workflows) {
      if (blueprint.skills.some((skill) => skill.id === workflow.id)) {
        diagnostics.push({
          code: 'BP-OPENCODE-001',
          severity: 'error',
          message: `Workflow "${workflow.id}" and a skill share an id. Both compile to ${PORTABLE_SKILLS_DIR}/${workflow.id}, so one would overwrite the other.`,
          ref: { kind: 'workflow', id: workflow.id },
          related: [{ kind: 'skill', id: workflow.id }],
        })
      }
    }

    // A subagent file and a command are different directories, but an agent named like a
    // workflow makes `@name` and `/name` mean different things, which is worth a warning.
    const primary = primaryAgentOf(blueprint)
    for (const agent of blueprint.agents) {
      if (agent.id === primary?.id) continue
      if (blueprint.workflows.some((workflow) => workflow.id === agent.id)) {
        diagnostics.push({
          code: 'BP-OPENCODE-002',
          severity: 'warning',
          message: `Agent "${agent.id}" and a workflow share an id. On OpenCode that is a subagent called \`@${agent.id}\` and a command called \`/${agent.id}\`, which read as the same thing and are not.`,
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
    const subagents = blueprint.agents.filter((agent) => agent.id !== primary?.id)

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

    for (const agent of subagents) {
      const result = agentFile(agent, blueprint)
      files.push(result.file)
      issues.push(...result.issues)
    }

    for (const workflow of blueprint.workflows) {
      files.push(commandFile(workflow))
      issues.push(
        issue(
          'workflows',
          'adapted',
          `Workflow "${workflow.name}" is compiled to an orchestration skill invoked with /${workflow.id}; OpenCode has no workflow engine, so the steps are instructions rather than enforced control flow.`,
          {
            ref: { kind: 'workflow', id: workflow.id },
            adaptation: `${COMMANDS_DIR}/${workflow.id}.md`,
          },
        ),
      )
    }

    // Rules limited to a plain directory become a nested AGENTS.md, byte-identical to the one
    // Codex emits, so the two targets share the file instead of fighting over it.
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
          `Rule "${rule.name}" applies to ${rule.paths.join(', ')}, which is not a plain directory, so OpenCode cannot load it selectively; it is always in context with an "Applies to" note.`,
          { ref: { kind: 'rule', id: rule.id } },
        ),
      )
    }

    if (options.emitConfig) {
      const looseReferences = blueprint.references.filter(
        (reference) => !blueprint.skills.some((skill) => skill.referenceIds.includes(reference.id)),
      )
      const { config, issues: configIssues } = buildConfig(
        blueprint,
        primary,
        looseReferences.length > 0 ? `${PORTABLE_REFERENCES_DIR}/*.md` : undefined,
      )
      issues.push(...configIssues)
      files.push(generatedFile('opencode.json', stableJson(config), 'json', 'opencode', []))
    }

    // A model has to be `provider/id` here, so a bare name is dropped rather than written as
    // something OpenCode would fail to resolve.
    for (const agent of subagents) {
      const hint = agent.model?.hint
      if (hint && !modelOf(agent)) {
        issues.push(
          issue(
            'agents',
            'limited',
            `"${agent.name}" asks for the model "${hint}", but OpenCode names models \`provider/id\`. The hint is left out so the agent uses the configured default; write it as \`anthropic/${hint}\` or similar to pin it.`,
            { ref: { kind: 'agent', id: agent.id } },
          ),
        )
      }
    }
    const preferenceOnly = blueprint.agents.filter(
      (agent) => agent.model?.preference && !agent.model.hint,
    )
    if (preferenceOnly.length > 0) {
      issues.push(
        issue(
          'agents',
          'limited',
          `OpenCode names a model \`provider/id\` and has no fast, balanced or strong tier, so the model preference on ${preferenceOnly.length} agent(s) is left to the configured default.`,
        ),
      )
    }

    if (blueprint.memories.length > 0) {
      issues.push(
        issue(
          'memory',
          'unsupported',
          `OpenCode has no persistent memory. The ${blueprint.memories.length} memory definition(s) are compiled into AGENTS.md as instructions to write notes into the repository instead.`,
          { adaptation: 'AGENTS.md "Memory" section' },
        ),
      )
    }

    if (blueprint.hooks.length > 0 || blueprint.gates.length > 0) {
      issues.push(
        issue(
          'hooks',
          'adapted',
          `${blueprint.hooks.length} hook(s) and ${blueprint.gates.length} gate(s) need a TypeScript plugin on OpenCode, which is code rather than configuration. They are described in AGENTS.md and in the workflow skills, and nothing runs them automatically (roadmap P8-10).`,
        ),
      )
    }

    return { files, issues }
  },
}
