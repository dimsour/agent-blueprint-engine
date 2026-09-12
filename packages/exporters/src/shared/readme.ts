/**
 * The generated repository's README. It is the one file that may talk about every target at
 * once, so it carries the per-harness usage notes that `AGENTS.md` deliberately leaves out.
 */
import type { Blueprint, HarnessId } from '@agent-blueprint/core'
import { HARNESS_LABELS } from '@agent-blueprint/core'

import { generatedFile, type GeneratedFile } from '../types'
import { withHeader } from './header'
import { code, Markdown } from './markdown'

interface HarnessUsage {
  /** Where the harness picks the repository up. */
  entry: string
  /** How the user runs a compiled workflow. */
  workflow: (workflowId: string) => string
  notes?: string[]
}

const USAGE: Record<HarnessId, HarnessUsage> = {
  'claude-code': {
    entry: '`CLAUDE.md` plus `.claude/` (skills, agents, rules, settings).',
    workflow: (id) => `/${id}`,
    notes: [
      'Hooks and permissions are in `.claude/settings.json`; review them before trusting the project.',
    ],
  },
  codex: {
    entry: '`AGENTS.md` plus `.agents/skills/` and `.codex/`.',
    workflow: (id) => `$${id}`,
    notes: [
      'Codex reads `.codex/config.toml` only for trusted projects; trust it once with `/trust` or add it to `~/.codex/config.toml`.',
      'Hooks and multi-agent support are behind `[features]` flags, which the generated config sets.',
    ],
  },
  copilot: {
    entry: '`AGENTS.md` plus `.github/` (instructions, skills, agents, prompts, hooks).',
    workflow: (id) => `/${id}`,
    notes: [
      'Hooks are in `.github/hooks/blueprint.json`; review them before trusting the project.',
      'Memory is not supported, and per-command permissions are guidance rather than a boundary; both are described in `AGENTS.md` only.',
      'Any MCP server is configured for the editor in `.vscode/mcp.json`; the cloud coding agent takes its MCP configuration from repository settings instead.',
    ],
  },
  opencode: {
    entry: '`AGENTS.md` plus `.agents/skills/`, `opencode.json` and `.opencode/`.',
    workflow: (id) => `/${id}`,
    notes: [
      'Permissions are enforced by `opencode.json`; read it before trusting the project, and remember that the last matching pattern wins.',
      'Hooks and gates are not enforced: they need a plugin, which is TypeScript rather than configuration. They are described in `AGENTS.md` and in the workflow skills.',
    ],
  },
  pi: {
    entry: '`AGENTS.md` plus `.agents/skills/`, `.pi/prompts/` and `.pi/settings.json`.',
    workflow: (id) => `/${id}`,
    notes: [
      'Pi runs one agent; steps that delegate ask the same session to adopt another persona, so the isolation the Blueprint asks for is not there.',
      'Permissions are a tool allowlist in `.pi/settings.json`. Pi has no ask, no per-command rules and no network tool, so the rest of the policy is guidance in `AGENTS.md`.',
      'Hooks and gates are not enforced: they need an extension, which is TypeScript rather than configuration.',
    ],
  },
}

/** Targets compiled as installable plugins rather than project files (P9-27). */
export function pluginTargets(blueprint: Blueprint, targets: readonly HarnessId[]): HarnessId[] {
  return targets.filter(
    (target) =>
      blueprint.targets.find((config) => config.harnessId === target)?.options.layout === 'plugin',
  )
}

/** How a plugin-layout target is installed, given where the repository lives. */
export function installCommands(
  blueprint: Blueprint,
  target: HarnessId,
  repository: string,
): string[] {
  switch (target) {
    case 'claude-code':
      return [
        `/plugin marketplace add ${repository}`,
        `/plugin install ${blueprint.id}@${blueprint.id}`,
      ]
    case 'codex':
      return [`codex plugin marketplace add ${repository}`]
    case 'copilot':
    case 'opencode':
    case 'pi':
      return []
  }
}

function usageOf(blueprint: Blueprint, target: HarnessId, plugin: boolean): HarnessUsage {
  if (!plugin) return USAGE[target]
  switch (target) {
    case 'claude-code':
      return {
        entry: 'a plugin at `plugins/claude-code/`, listed in `.claude-plugin/marketplace.json`.',
        workflow: (id) => `/${blueprint.id}:${id}`,
        notes: [
          'Hooks are in `plugins/claude-code/hooks/hooks.json`; review them before installing. The plugin carries no permissions: the project that installs it decides what is allowed.',
        ],
      }
    case 'codex':
      return {
        entry: 'a plugin at `plugins/codex/`, listed in `.agents/plugins/marketplace.json`.',
        workflow: (id) => `$${blueprint.id}:${id}`,
        notes: [
          'Hooks are in `plugins/codex/hooks/hooks.json`; review them before installing. Subagents, permissions and memory are not part of a Codex plugin; the persona and Iron Laws are the `guide` skill.',
        ],
      }
    case 'copilot':
    case 'opencode':
    case 'pi':
      return USAGE[target]
  }
}

export interface ReadmeOptions {
  /**
   * Where the repository lives on GitHub, as `owner/name`, when the caller knows — a push
   * does; an export to a ZIP does not. With it the install commands are the real ones.
   */
  repository?: string
}

export function emitReadme(
  blueprint: Blueprint,
  targets: readonly HarnessId[],
  options: ReadmeOptions = {},
): GeneratedFile {
  const plugins = new Set(pluginTargets(blueprint, targets))
  const usage = (target: HarnessId) => usageOf(blueprint, target, plugins.has(target))
  const md = new Markdown()
  md.heading(1, blueprint.name)
  md.paragraph(blueprint.description)
  md.paragraph(
    'This repository is an AI agent configuration compiled from a Blueprint. Clone it, open it with any of the harnesses below, and the agent is configured.',
  )

  md.heading(2, 'What is here')
  md.bullets([
    `${code('blueprint/')} — the source of truth. Every other file is generated from it.`,
    ...targets.map((target) => `${HARNESS_LABELS[target]} — ${usage(target).entry}`),
  ])

  if (plugins.size > 0) {
    md.heading(2, 'Installing')
    md.paragraph(
      options.repository
        ? `The plugin installs from this repository, \`${options.repository}\` on GitHub.`
        : 'Once this repository is on GitHub, the plugin installs from it; `<owner>/<repo>` is the repository path there.',
    )
    for (const target of plugins) {
      md.paragraph(`**${HARNESS_LABELS[target]}:**`)
      md.raw(
        [
          '```',
          ...installCommands(blueprint, target, options.repository ?? '<owner>/<repo>'),
          '```',
        ].join('\n'),
      )
    }
  }

  if (blueprint.workflows.length > 0) {
    md.heading(2, 'Workflows')
    md.table(
      ['Workflow', 'What it does', ...targets.map((target) => HARNESS_LABELS[target])],
      blueprint.workflows.map((workflow) => [
        workflow.name,
        workflow.description ?? '',
        ...targets.map((target) => code(usage(target).workflow(workflow.id))),
      ]),
    )
  }

  const notes = targets.flatMap((target) =>
    (usage(target).notes ?? []).map((note) => `**${HARNESS_LABELS[target]}:** ${note}`),
  )
  if (notes.length > 0) {
    md.heading(2, 'Before you trust it')
    md.bullets(notes)
  }

  md.heading(2, 'Changing the agent')
  md.paragraph(
    'Edit the Blueprint, not the generated files: open this repository in Agent Blueprint, or edit the Markdown and YAML under `blueprint/` directly and recompile. Generated files are overwritten on the next export, and `blueprint/build-manifest.json` records which files the compiler owns.',
  )

  return generatedFile('README.md', withHeader('blueprint/', md.render()), 'markdown', 'shared', [])
}
