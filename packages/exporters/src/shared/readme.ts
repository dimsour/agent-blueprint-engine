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
    entry: '`AGENTS.md` plus `.agents/skills/`.',
    workflow: (id) => `/skill:${id}`,
    notes: [
      'Pi runs one agent; steps that delegate ask the same session to adopt another persona.',
    ],
  },
}

export function emitReadme(blueprint: Blueprint, targets: readonly HarnessId[]): GeneratedFile {
  const md = new Markdown()
  md.heading(1, blueprint.name)
  md.paragraph(blueprint.description)
  md.paragraph(
    'This repository is an AI agent configuration compiled from a Blueprint. Clone it, open it with any of the harnesses below, and the agent is configured.',
  )

  md.heading(2, 'What is here')
  md.bullets([
    `${code('blueprint/')} — the source of truth. Every other file is generated from it.`,
    ...targets.map((target) => `${HARNESS_LABELS[target]} — ${USAGE[target].entry}`),
  ])

  if (blueprint.workflows.length > 0) {
    md.heading(2, 'Workflows')
    md.table(
      ['Workflow', 'What it does', ...targets.map((target) => HARNESS_LABELS[target])],
      blueprint.workflows.map((workflow) => [
        workflow.name,
        workflow.description ?? '',
        ...targets.map((target) => code(USAGE[target].workflow(workflow.id))),
      ]),
    )
  }

  const notes = targets.flatMap((target) =>
    (USAGE[target].notes ?? []).map((note) => `**${HARNESS_LABELS[target]}:** ${note}`),
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
