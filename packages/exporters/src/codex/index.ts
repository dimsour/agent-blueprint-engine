/**
 * OpenAI Codex adapter.
 *
 * Codex reads the portable artifacts (`AGENTS.md`, `.agents/skills/`) that OpenCode and Pi
 * also read, so this adapter emits those through the shared emitters and adds only what is
 * Codex-specific: the `agents/openai.yaml` sidecars, subagent TOML files, `config.toml` and
 * `hooks.json`. File conventions: docs/harness/codex.md.
 */
import type { Agent, Blueprint, Diagnostic } from '@agent-blueprint/core'
import { stableJson } from '@agent-blueprint/core'
import { z } from 'zod'

import { lawsForAgent, primaryAgentOf } from '../shared/instructions'
import {
  directoryScopedRules,
  emitPortableInstructionFile,
  emitPortableSkillSet,
  PORTABLE_INSTRUCTIONS_MAX_BYTES,
  PORTABLE_REFERENCES_DIR,
  PORTABLE_SKILLS_DIR,
  portableInstructions,
} from '../shared/portable'
import { withHeader } from '../shared/header'
import { toToml } from '../shared/toml'
import {
  type CapabilityMatrix,
  type CompatibilityIssue,
  type CompileResult,
  generatedFile,
  type GeneratedFile,
  type HarnessAdapter,
} from '../types'
import { buildConfig, buildHooks, hookScriptFiles, lowerPermissions } from './config'
import { compileCodexPlugin, GUIDE_SKILL_ID } from './plugin'
import { openAiSidecar } from './sidecar'

const optionsSchema = z
  .object({
    /** Codex caps concatenated instruction files; lower this if other AGENTS.md files exist. */
    instructionsMaxBytes: z.number().int().min(1024).default(PORTABLE_INSTRUCTIONS_MAX_BYTES),
    /** Set false when the repository already has a hand-written `.codex/config.toml`. */
    emitConfig: z.boolean().default(true),
    /**
     * `project`: `AGENTS.md`, `.agents/skills/` and `.codex/`, picked up by opening the
     * repository. `plugin`: a plugin under `plugins/codex/` and a marketplace listing it,
     * installed with `codex plugin marketplace add` (P9-28).
     */
    layout: z.enum(['project', 'plugin']).default('project'),
  })
  .prefault({})

export type CodexOptions = z.output<typeof optionsSchema>

const capabilities: CapabilityMatrix = {
  skills: {
    support: 'native',
    explanation:
      'Skills compile to `.agents/skills/<id>/SKILL.md` with an `agents/openai.yaml` sidecar and are invoked with `$<id>`.',
  },
  agents: {
    support: 'native',
    explanation:
      'Non-primary agents become `.codex/agents/<id>.toml` subagents, enabled by the `multi_agent` feature flag.',
  },
  parallelAgents: {
    support: 'native',
    explanation:
      'Codex runs several subagent threads per session, so parallel branches keep their meaning.',
  },
  workflows: {
    support: 'adapted',
    explanation:
      'Workflows compile to orchestration skills; Codex has no workflow engine, so the steps are instructions.',
  },
  hooks: {
    support: 'native',
    explanation:
      'Hooks compile to `.codex/hooks.json`. Codex has no model-side prompt handler, so checks become printed reminders.',
  },
  gates: {
    support: 'native',
    explanation:
      'Gate criteria that run a command become `Stop` hooks; the rest stay as instructions in the workflow skill.',
  },
  permissions: {
    support: 'limited',
    explanation:
      'Codex has one approval policy and one sandbox mode for the whole session, so per-command rules become instructions rather than enforced boundaries.',
  },
  memory: {
    support: 'native',
    explanation:
      'Memory definitions enable the Codex memories feature and seed the memory section of AGENTS.md.',
  },
  pathScopedRules: {
    support: 'adapted',
    explanation:
      'Rules limited to a plain directory become a nested `AGENTS.md`; glob-scoped rules are inlined with an "Applies to" line.',
  },
  commands: {
    support: 'adapted',
    explanation: 'Codex has no prompt files; skills act as commands and are invoked with `$<id>`.',
  },
  ironLaws: {
    support: 'adapted',
    explanation:
      'Iron Laws become an AGENTS.md section, plus a printed reminder on stop for laws marked for hook enforcement.',
  },
  references: {
    support: 'native',
    explanation:
      'References attached to a skill are copied beside it; the others live in `.agents/references/`.',
  },
}

function developerInstructions(agent: Agent, blueprint: Blueprint): string {
  const parts = [agent.body]
  if (agent.responsibilities.length > 0) {
    parts.push(
      ['Responsibilities:', ...agent.responsibilities.map((item) => `- ${item}`)].join('\n'),
    )
  }
  if (agent.outputRequirements.length > 0) {
    parts.push(
      ['Output requirements:', ...agent.outputRequirements.map((item) => `- ${item}`)].join('\n'),
    )
  }
  const laws = lawsForAgent(blueprint, agent.id).filter((law) => !law.scope.all)
  if (laws.length > 0) {
    parts.push(['Never violate:', ...laws.map((law) => `- ${law.name}: ${law.rule}`)].join('\n'))
  }
  return parts.filter((part) => part.trim().length > 0).join('\n\n')
}

/** What changes when the same Blueprint is a Codex plugin rather than a project (P9-28). */
const pluginCapabilities: CapabilityMatrix = {
  ...capabilities,
  skills: {
    support: 'native',
    explanation:
      "Skills compile to the plugin's `skills/<id>/SKILL.md` with an `agents/openai.yaml` sidecar and are invoked with `$<plugin>:<id>`.",
  },
  agents: {
    support: 'unsupported',
    explanation:
      "A Codex plugin installs no subagents. Steps that delegate ask the session to adopt the agent's persona instead.",
  },
  parallelAgents: {
    support: 'unsupported',
    explanation:
      'Without subagents there is nothing to run in parallel; branches run one after another.',
  },
  hooks: {
    support: 'native',
    explanation:
      "Hooks compile to the plugin's `hooks/hooks.json`. Hooks with a script are not emitted: Codex documents no variable a plugin hook could reach its own files by.",
  },
  permissions: {
    support: 'unsupported',
    explanation:
      "A Codex plugin carries no config. The permissions are the command policy in the guide skill; the session's own sandbox and approval policy apply.",
  },
  memory: {
    support: 'unsupported',
    explanation:
      'A Codex plugin cannot turn the memories feature on; the seed is in the guide skill.',
  },
  pathScopedRules: {
    support: 'adapted',
    explanation:
      'A plugin has no nested `AGENTS.md`; every rule is in the guide skill, with an "Applies to" note when it has paths.',
  },
  commands: {
    support: 'adapted',
    explanation: 'Skills act as commands, invoked with `$<plugin>:<id>`.',
  },
  ironLaws: {
    support: 'adapted',
    explanation:
      'A Codex plugin has no instruction file. The persona and Iron Laws are the `guide` skill, loaded when asked or when its description matches rather than always.',
  },
  references: {
    support: 'adapted',
    explanation:
      'References attached to a skill are copied beside it; the others live beside the guide skill and are named from it.',
  },
}

export const codexAdapter: HarnessAdapter<CodexOptions> = {
  id: 'codex',
  name: 'OpenAI Codex',
  version: '1.0.0',
  docsUrl: 'https://learn.chatgpt.com/docs/agent-configuration/agents-md.md',
  capabilities,
  capabilitiesFor: (options) => (options.layout === 'plugin' ? pluginCapabilities : capabilities),
  optionsSchema,
  parseOptions: (raw) => optionsSchema.parse(raw),

  validate(blueprint, options) {
    const diagnostics: Diagnostic[] = []
    // The plugin's instruction skill takes one id; a Blueprint artifact with that id would
    // overwrite it.
    if (options.layout === 'plugin') {
      for (const item of [...blueprint.skills, ...blueprint.workflows]) {
        if (item.id !== GUIDE_SKILL_ID) continue
        diagnostics.push({
          code: 'BP-CODEX-003',
          severity: 'error',
          message: `"${item.id}" is the id of the plugin's guide skill, which carries the persona and Iron Laws; rename this artifact or it overwrites the guide.`,
          ref: {
            kind: blueprint.skills.includes(item as never) ? 'skill' : 'workflow',
            id: item.id,
          },
        })
      }
    }
    for (const workflow of blueprint.workflows) {
      if (blueprint.skills.some((skill) => skill.id === workflow.id)) {
        diagnostics.push({
          code: 'BP-CODEX-001',
          severity: 'error',
          message: `Workflow "${workflow.id}" and a skill share an id. Both compile to ${PORTABLE_SKILLS_DIR}/${workflow.id}, so one would overwrite the other.`,
          ref: { kind: 'workflow', id: workflow.id },
          related: [{ kind: 'skill', id: workflow.id }],
        })
      }
    }

    const size = new TextEncoder().encode(portableInstructions(blueprint).content).length
    if (size > options.instructionsMaxBytes) {
      diagnostics.push({
        code: 'BP-CODEX-002',
        severity: 'warning',
        message: `AGENTS.md is ${size} bytes after moving optional sections out, above the ${options.instructionsMaxBytes}-byte budget. Codex may truncate it; shorten the persona or the Iron Laws.`,
      })
    }
    return diagnostics
  },

  compile(blueprint, options): CompileResult {
    if (options.layout === 'plugin') return compileCodexPlugin(blueprint)

    const files: GeneratedFile[] = []
    const issues: CompatibilityIssue[] = []
    const primary = primaryAgentOf(blueprint)
    const subagents = blueprint.agents.filter((agent) => agent.id !== primary?.id)

    const instructions = emitPortableInstructionFile(blueprint)
    files.push(instructions.file)

    const skillSet = emitPortableSkillSet(blueprint, {
      root: PORTABLE_SKILLS_DIR,
      owner: 'shared',
      referencesDir: PORTABLE_REFERENCES_DIR,
    })
    files.push(...skillSet.files)
    for (const warning of skillSet.warnings) {
      issues.push({
        harnessId: 'codex',
        concept: 'skills',
        support: 'limited',
        ref: { kind: 'skill', id: warning.skillId },
        message: warning.message,
      })
    }

    for (const skill of blueprint.skills) {
      files.push(openAiSidecar(skill.id, skill.name, skill.description, 'codex'))
      if (
        skill.activation.filePatterns.length > 0 ||
        skill.activation.directories.length > 0 ||
        skill.activation.fileTypes.length > 0
      ) {
        issues.push({
          harnessId: 'codex',
          concept: 'skills',
          support: 'adapted',
          ref: { kind: 'skill', id: skill.id },
          message: `Skill "${skill.name}" activates on file patterns, which Codex cannot match; the conditions are written into the skill body so the model can apply them itself.`,
        })
      }
    }
    for (const workflow of blueprint.workflows) {
      files.push(openAiSidecar(workflow.id, workflow.name, workflow.description, 'codex'))
      issues.push({
        harnessId: 'codex',
        concept: 'workflows',
        support: 'adapted',
        ref: { kind: 'workflow', id: workflow.id },
        message: `Workflow "${workflow.name}" is compiled to an orchestration skill invoked with $${workflow.id}.`,
        adaptation: `${PORTABLE_SKILLS_DIR}/${workflow.id}/SKILL.md`,
      })
    }

    // Rules limited to a plain directory become a nested AGENTS.md, which Codex loads only
    // when it works in that directory. Glob-scoped rules stay in the root file.
    for (const { dir, ruleIds } of directoryScopedRules(blueprint)) {
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
    const inlinedRules = blueprint.rules.filter(
      (rule) =>
        rule.paths.length > 0 &&
        !directoryScopedRules(blueprint).some((entry) => entry.ruleIds.includes(rule.id)),
    )
    for (const rule of inlinedRules) {
      issues.push({
        harnessId: 'codex',
        concept: 'pathScopedRules',
        support: 'adapted',
        ref: { kind: 'rule', id: rule.id },
        message: `Rule "${rule.name}" applies to ${rule.paths.join(', ')}, which is not a plain directory, so Codex cannot load it selectively; it is always in context with an "Applies to" note.`,
      })
    }

    for (const agent of subagents) {
      if (agent.budget?.maxTurns) {
        issues.push({
          harnessId: 'codex',
          concept: 'agents',
          support: 'limited',
          ref: { kind: 'agent', id: agent.id },
          message: `Agent "${agent.name}" has a turn budget of ${agent.budget.maxTurns}, which Codex agent files cannot express; it is not enforced.`,
        })
      }
      files.push(
        generatedFile(
          `.codex/agents/${agent.id}.toml`,
          toToml({
            name: agent.id,
            description: agent.description ?? agent.responsibilities.join('; '),
            developer_instructions: developerInstructions(agent, blueprint),
            ...(agent.model?.hint ? { model: agent.model.hint } : {}),
            ...(agent.budget?.effort ? { model_reasoning_effort: agent.budget.effort } : {}),
            // The one permission a subagent can carry on its own: whether it may write at
            // all (P9-26). The rest is the session's, and reported as such.
            ...(agent.permissions.operations['fs.write'] === 'deny'
              ? { sandbox_mode: 'read-only' }
              : {}),
          }),
          'toml',
          'codex',
          [{ kind: 'agent', id: agent.id }],
        ),
      )
    }

    const laws = lawsForAgent(blueprint, primary?.id)
    const hooks = buildHooks(blueprint, laws)
    issues.push(...hooks.issues)
    if (hooks.hooks) {
      files.push(
        generatedFile('.codex/hooks.json', stableJson({ hooks: hooks.hooks }), 'json', 'codex', []),
      )
      files.push(...hookScriptFiles(blueprint))
    }

    if (options.emitConfig) {
      const permissions = lowerPermissions(primary)
      issues.push(...permissions.issues)
      files.push(
        generatedFile(
          '.codex/config.toml',
          toToml(
            buildConfig(
              blueprint,
              primary,
              permissions.permissions,
              subagents,
              Boolean(hooks.hooks),
            ),
          ),
          'toml',
          'codex',
          [],
        ),
      )
    }

    return { files, issues }
  },
}
