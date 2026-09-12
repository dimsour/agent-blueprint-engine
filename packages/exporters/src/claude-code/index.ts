/**
 * Claude Code adapter.
 *
 * Claude Code has a native primitive for nearly every Blueprint concept, so this adapter is
 * mostly a direct mapping; the one genuinely compiled thing is a workflow, which becomes an
 * orchestration skill. File conventions and field names: docs/harness/claude-code.md.
 */
import type { Diagnostic } from '@agent-blueprint/core'
import { stableJson } from '@agent-blueprint/core'

import type { Frontmatter } from '../shared/frontmatter'
import { markdownWithFrontmatter } from '../shared/frontmatter'
import { composeInstructions, lawsForAgent, primaryAgentOf } from '../shared/instructions'
import { code } from '../shared/markdown'
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
import {
  agentFile,
  REFERENCES_DIR,
  ruleFile,
  RULES_DIR,
  SKILLS_DIR,
  skillFrontmatter,
  toolNames,
} from './emit'
import { type ClaudeCodeOptions, optionsSchema } from './options'
import { compilePlugin } from './plugin'
import { buildSettings, hookScriptFiles } from './settings'

export type { ClaudeCodeOptions } from './options'

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

/** What changes when the same Blueprint is a plugin rather than a project (P9-27). */
const pluginCapabilities: CapabilityMatrix = {
  ...capabilities,
  hooks: {
    support: 'native',
    explanation:
      "Hooks compile to the plugin's `hooks/hooks.json`, with scripts beside it, and run in every project the plugin is enabled in.",
  },
  agents: {
    support: 'native',
    explanation:
      "Every non-primary agent becomes a subagent in the plugin's `agents/`, carrying every law that binds it. Claude ignores `permissionMode` on a plugin's agents, so a mode other than the default is reported.",
  },
  permissions: {
    support: 'adapted',
    explanation:
      "A plugin's settings file accepts no permission lists. Deny and ask rules become PreToolUse hooks with the rule as their `if`, which deny or ask on the same calls with the same precedence; allow rules are not emitted, since an allow from a hook would bypass the installing project's own deny list.",
  },
  memory: {
    support: 'limited',
    explanation:
      'A plugin cannot turn auto-memory on. The memory seed is in `instructions.md`; the installing project decides whether Claude remembers. A subagent with memory keeps its own: `memory` works on a plugin agent.',
  },
  pathScopedRules: {
    support: 'adapted',
    explanation:
      'A plugin has no rules directory. A rule with paths becomes the skill `rule-<id>` with the same `paths:` header, so it loads on the same files.',
  },
  commands: {
    support: 'native',
    explanation:
      'Skills and workflows are slash commands namespaced by the plugin (`/<id>:<name>`).',
  },
  ironLaws: {
    support: 'adapted',
    explanation:
      'A plugin has no instruction file. The persona and Iron Laws are `instructions.md`, printed into every session by a SessionStart hook and again after compaction; subagents carry their laws in their own files.',
  },
  references: {
    support: 'adapted',
    explanation:
      "References attached to a skill are copied beside it; the others live in the plugin's `references/` and are named from `instructions.md`, which cannot import files; the SessionStart hook says where the plugin is installed so they can be read from there.",
  },
}

export const claudeCodeAdapter: HarnessAdapter<ClaudeCodeOptions> = {
  id: 'claude-code',
  name: 'Claude Code',
  version: '1.0.0',
  docsUrl: 'https://code.claude.com/docs/en/skills',
  capabilities,
  capabilitiesFor: (options) => (options.layout === 'plugin' ? pluginCapabilities : capabilities),
  optionsSchema,
  parseOptions: (raw) => optionsSchema.parse(raw),

  validate(blueprint, options) {
    const diagnostics: Diagnostic[] = []
    // A plugin has no rules directory: a path-scoped rule becomes the skill `rule-<id>`.
    if (options.layout === 'plugin') {
      const taken = new Set([...blueprint.skills, ...blueprint.workflows].map((item) => item.id))
      for (const rule of blueprint.rules) {
        if (rule.paths.length === 0 || !taken.has(`rule-${rule.id}`)) continue
        diagnostics.push({
          code: 'BP-CLAUDE-002',
          severity: 'error',
          message: `Rule "${rule.id}" compiles to the skill rule-${rule.id} in the plugin layout, and a skill or workflow already has that id, so one would overwrite the other.`,
          ref: { kind: 'rule', id: rule.id },
        })
      }
    }
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
    if (options.layout === 'plugin') return compilePlugin(blueprint, options)

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
      pathScopedRuleLocation: (ruleId) => code(`${RULES_DIR}/${ruleId}.md`),
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
